import { Job, QueueEvents } from 'bullmq'
import { BaseAgent, GROQ_MODEL } from './base.agent.js'
import { PlannerAgent } from './planner.agent.js'
import { CriticAgent } from './critic.agent.js'
import { SynthesizerAgent } from './synthesizer.agent.js'
import { orchestratorPrompt } from '../prompts/orchestrator.prompt.js'
import { QueryType, CriticReport } from '@synthex/shared/types/research.types'
import { JobPayload } from '@synthex/shared/types/queue.types'
import pool from '../db/client.js'

const MAX_REQUERY_ROUNDS = parseInt(process.env.MAX_REQUERY_ROUNDS ?? '3')
const CONFIDENCE_THRESHOLD = parseFloat(process.env.CRITIC_CONFIDENCE_THRESHOLD ?? '0.7')
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'
// Hard cap on how long the orchestrator waits for any single researcher. A wedged
// researcher (e.g. a stalled upstream API) must never hang the whole job — after
// this it's treated as failed and the round proceeds with whatever findings exist.
const RESEARCHER_TIMEOUT_MS = parseInt(process.env.RESEARCHER_TIMEOUT_MS ?? '120000')

type Classification = {
  queryType: QueryType
  researchStrategy: string
  estimatedComplexity: 'low' | 'medium' | 'high'
}

// The agents the Orchestrator drives. Injectable so the re-query loop can be
// tested deterministically without live LLM/queue calls.
type OrchestratorDeps = {
  planner?: PlannerAgent
  critic?: CriticAgent
  synthesizer?: SynthesizerAgent
}

export class OrchestratorAgent extends BaseAgent {
  private planner: PlannerAgent
  private critic: CriticAgent
  private synthesizer: SynthesizerAgent

  constructor(deps: OrchestratorDeps = {}) {
    super('orchestrator')
    this.planner = deps.planner ?? new PlannerAgent()
    this.critic = deps.critic ?? new CriticAgent()
    this.synthesizer = deps.synthesizer ?? new SynthesizerAgent()
  }

  async run(jobId: string, input: { query: string }): Promise<void> {
    const { query } = input
    let round = 0
    let confidence = 0

    // Every path out of this method must end in a terminal SSE event ('done' or
    // a fatal 'error'). Without it the frontend's EventSource waits forever, so
    // any failure — a planner that returns no JSON, a Claude/DB outage — is
    // caught here, recorded as 'failed', and surfaced to the client.
    try {
      this.emit(jobId, { type: 'thinking', payload: { message: 'Classifying query…' } })
      const classification = await this.classifyQuery(query)
      this.emit(jobId, {
        type: 'thinking',
        payload: { message: `Query classified: ${classification.queryType} (${classification.estimatedComplexity} complexity)`, ...classification },
      })

      await pool.query('UPDATE research_jobs SET status = $1 WHERE id = $2', ['running', jobId])

      // QueueEvents lets us block on individual researcher jobs finishing.
      const queueEvents = new QueueEvents('research', { connection: { url: REDIS_URL } })
      await queueEvents.waitUntilReady()

      let gaps: string[] = []

      try {
        while (round < MAX_REQUERY_ROUNDS && confidence < CONFIDENCE_THRESHOLD) {
          round++
          this.emit(jobId, { type: 'thinking', payload: { message: `Research round ${round} of ${MAX_REQUERY_ROUNDS}`, round } })

          // 1. Plan → enqueue subtasks (targeting gaps on re-query rounds).
          const jobs = await this.planner.run(jobId, { query, queryType: classification.queryType, round, gaps })

          // 2. Wait for the parallel researchers to actually finish before judging.
          await this.waitForResearchers(jobId, jobs, queueEvents)

          // 3. Critic evaluates the accumulated findings adversarially.
          const report: CriticReport = await this.critic.run(jobId, { round, queryType: classification.queryType })
          confidence = report.confidenceScore
          gaps = report.gaps

          // Track the round count and latest confidence on the job row.
          await pool.query(
            'UPDATE research_jobs SET requery_count = $1, confidence_score = $2 WHERE id = $3',
            [round, confidence, jobId]
          )

          if (confidence >= CONFIDENCE_THRESHOLD) {
            this.emit(jobId, { type: 'thinking', payload: { message: `Confidence ${confidence.toFixed(2)} ≥ ${CONFIDENCE_THRESHOLD} — proceeding to synthesis`, round } })
            break
          }

          if (round < MAX_REQUERY_ROUNDS) {
            this.emit(jobId, {
              type: 'thinking',
              payload: { message: `Confidence ${confidence.toFixed(2)} below threshold — re-querying to fill ${gaps.length} gaps`, gaps, round },
            })
          } else {
            this.emit(jobId, { type: 'thinking', payload: { message: `Confidence ${confidence.toFixed(2)} still below threshold but max rounds reached — synthesizing best available`, round } })
          }
        }
      } finally {
        await queueEvents.close()
      }

      // Synthesizer only runs once, after the loop settles.
      await this.synthesizer.run(jobId, { query })

      await pool.query('UPDATE research_jobs SET status = $1, confidence_score = $2 WHERE id = $3', ['done', confidence, jobId])
      this.emit(jobId, { type: 'done', payload: { confidence, rounds: round } })
    } catch (err) {
      const message = (err as Error).message
      console.error(`[orchestrator] job ${jobId} failed:`, err)
      try {
        await pool.query('UPDATE research_jobs SET status = $1 WHERE id = $2', ['failed', jobId])
      } catch (dbErr) {
        console.error(`[orchestrator] could not mark job ${jobId} failed:`, dbErr)
      }
      // `fatal` distinguishes this terminal failure from the non-fatal per-tool
      // 'error' events (e.g. a single embed retry) that the base agent emits.
      this.emit(jobId, { type: 'error', payload: { fatal: true, error: message } })
    }
  }

  // Blocks until every enqueued researcher job resolves. A single failed
  // researcher (e.g. a throttled embed) must not abort the round — allSettled.
  private async waitForResearchers(jobId: string, jobs: Job<JobPayload>[], queueEvents: QueueEvents): Promise<void> {
    if (jobs.length === 0) return
    this.emit(jobId, { type: 'thinking', payload: { message: `Waiting for ${jobs.length} researchers to complete…` } })

    // Race each researcher against a timeout so a single wedged job can't block
    // the round forever — allSettled already tolerates a rejected/timed-out one.
    const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T> =>
      Promise.race([
        p,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`researcher exceeded ${ms}ms`)), ms).unref?.()
        ),
      ])

    const results = await Promise.allSettled(
      jobs.map((j) => withTimeout(j.waitUntilFinished(queueEvents), RESEARCHER_TIMEOUT_MS))
    )
    const failed = results.filter((r) => r.status === 'rejected').length

    this.emit(jobId, {
      type: 'thinking',
      payload: { message: `${jobs.length - failed}/${jobs.length} researchers completed`, failed },
    })
  }

  private async classifyQuery(query: string): Promise<Classification> {
    const msg = await this.client.chat.completions.create({
      model: GROQ_MODEL,
      max_tokens: 256,
      messages: [
        { role: 'system', content: orchestratorPrompt },
        { role: 'user', content: `Classify this research query:\n\n${query}` },
      ],
    })

    const text = (msg.choices[0]?.message?.content ?? '').trim()
    const jsonMatch = text.match(/\{[\s\S]*\}/)

    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]) as Classification
        const validTypes: QueryType[] = ['factual', 'exploratory', 'comparative', 'causal']
        if (validTypes.includes(parsed.queryType)) return parsed
      } catch {
        // fall through to default
      }
    }

    return { queryType: 'exploratory', researchStrategy: 'General multi-source research', estimatedComplexity: 'medium' }
  }
}
