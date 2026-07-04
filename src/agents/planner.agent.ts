import { Job } from 'bullmq'
import { BaseAgent } from './base.agent.js'
import { researchQueue } from '../queue/research.queue.js'
import { plannerPrompt } from '../prompts/planner.prompt.js'
import { QueryType } from '@synthex/shared/types/research.types'
import { JobPayload } from '@synthex/shared/types/queue.types'

const MAX_RESEARCHER_AGENTS = parseInt(process.env.MAX_RESEARCHER_AGENTS ?? '3')

type PlannerInput = {
  query: string
  queryType: QueryType
  round: number
  gaps?: string[] // on re-query rounds, the Critic's list of missing evidence
}

export class PlannerAgent extends BaseAgent {
  constructor() {
    super('planner')
  }

  // Decomposes the query into subtasks, enqueues them, and returns the enqueued
  // BullMQ jobs so the Orchestrator can wait for the researchers to finish.
  async run(jobId: string, input: PlannerInput): Promise<Job<JobPayload>[]> {
    const { query, queryType, round, gaps = [] } = input

    const isRequery = round > 1 && gaps.length > 0
    this.emit(jobId, {
      type: 'thinking',
      payload: { message: isRequery ? 'Planning a gap-filling round…' : 'Decomposing query into subtasks…', round },
    })

    // On a re-query round, steer the decomposition at the specific gaps the Critic
    // flagged rather than re-running the original subtasks.
    const gapBlock = isRequery
      ? `\n\nThis is a RE-QUERY round. The previous round scored below the confidence threshold. Target ONLY these gaps flagged by the Critic — do not repeat prior subtasks:\n${gaps.map((g, i) => `${i + 1}. ${g}`).join('\n')}`
      : ''

    const msg = await this.client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: plannerPrompt,
      messages: [{
        role: 'user',
        content: `Query: "${query}"\nType: ${queryType}\nRound: ${round}${gapBlock}\n\nReturn a JSON array of up to ${MAX_RESEARCHER_AGENTS} subtask objects with fields: subtaskId (string), description (string), searchStrategy ("web"|"academic"|"news"|"domain").`,
      }],
    })

    const raw = (msg.content.find((b) => b.type === 'text') as { text: string } | undefined)?.text ?? ''
    const jsonMatch = raw.match(/\[[\s\S]*\]/)
    if (!jsonMatch) throw new Error('Planner returned no valid JSON')

    const subtasks: Array<{ subtaskId: string; description: string; searchStrategy: JobPayload['searchStrategy'] }> =
      JSON.parse(jsonMatch[0])

    this.emit(jobId, { type: 'thinking', payload: { message: `Enqueuing ${subtasks.length} subtasks`, subtasks, round } })

    return Promise.all(
      subtasks.map((t) =>
        researchQueue.add('research-subtask', {
          jobId,
          // Namespace the subtask id by round so re-query subtasks don't collide.
          subtaskId: `r${round}-${t.subtaskId}`,
          query: t.description,
          searchStrategy: t.searchStrategy,
        } satisfies JobPayload)
      )
    )
  }
}
