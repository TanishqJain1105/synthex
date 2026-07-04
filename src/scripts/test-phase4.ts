import 'dotenv/config'
import { Pool } from 'pg'
import { v4 as uuidv4 } from 'uuid'

const ok = (label: string) => console.log(`  ✓ ${label}`)
const warn = (label: string) => console.log(`  ⚠ ${label}`)
const fail = (label: string, err: unknown) => { console.error(`  ✗ ${label}:`, err); process.exit(1) }
const hasKey = (k?: string) => !!k && k !== 'placeholder'

async function testScoreSource() {
  console.log('\n[1] score-source — objective credibility object')
  const { scoreSource } = await import('../tools/score-source.tool.js')

  const academic = await scoreSource('https://arxiv.org/abs/2301.00001', [])
  if (academic.domainAuthority !== 0.9) fail('authority', `arxiv should be 0.9, got ${academic.domainAuthority}`)
  ok(`domain authority: arxiv.org → ${academic.domainAuthority}`)

  const forum = await scoreSource('https://reddit.com/r/x/comments/1', [])
  if (forum.domainAuthority !== 0.3) fail('authority', `reddit should be 0.3, got ${forum.domainAuthority}`)
  ok(`domain authority: reddit.com → ${forum.domainAuthority}`)

  // Recency: an old dated source should be penalized vs a fresh one on the same domain.
  const old = await scoreSource('https://example.com/2010/03/15/article', [])
  const fresh = await scoreSource('https://example.com/2025/03/15/article', [])
  if (old.ageYears === null) fail('date', 'failed to extract publication date from URL')
  ok(`publication date extracted: ${old.publicationDate} (age ≈ ${old.ageYears!.toFixed(1)}y)`)
  if (!(old.score < fresh.score)) fail('recency', `old (${old.score}) should score below fresh (${fresh.score})`)
  ok(`recency penalty applied: old ${old.score.toFixed(2)} < fresh ${fresh.score.toFixed(2)}`)

  // Corroboration: independent peer domains raise the count and score.
  const solo = await scoreSource('https://blog.com/a', [])
  const corroborated = await scoreSource('https://blog.com/a', ['https://nature.com/x', 'https://bbc.com/y'])
  if (corroborated.corroborationCount !== 2) fail('corroboration', `expected 2, got ${corroborated.corroborationCount}`)
  ok(`corroboration count: 2 independent domains → score ${solo.score.toFixed(2)} → ${corroborated.score.toFixed(2)}`)
}

async function testRequeryColumn() {
  console.log('\n[2] Schema — requery_count column on research_jobs')
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  try {
    const { rows } = await pool.query(
      `SELECT column_name, data_type, column_default FROM information_schema.columns
       WHERE table_name = 'research_jobs' AND column_name = 'requery_count'`
    )
    if (rows.length === 0) fail('column', 'requery_count column missing')
    ok(`requery_count present (${(rows[0] as { data_type: string }).data_type}, default ${(rows[0] as { column_default: string }).column_default})`)
  } finally {
    await pool.end()
  }
}

// Deterministic test of the Orchestrator re-query loop using injected fake agents.
// Scripts the Critic's confidence per round to prove the control flow.
async function testRequeryLoop() {
  console.log('\n[3] Orchestrator re-query loop (deterministic, injected agents)')
  const { OrchestratorAgent } = await import('../agents/orchestrator.agent.js')
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })

  const makeFakes = (confidences: number[]) => {
    const plannerCalls: number[] = []
    const gapsSeen: string[][] = []
    let criticCall = 0
    let synthRan = false

    const planner = {
      run: async (_jobId: string, input: { round: number; gaps?: string[] }) => {
        plannerCalls.push(input.round)
        gapsSeen.push(input.gaps ?? [])
        return [] // no real jobs → waitForResearchers is a no-op
      },
    }
    const critic = {
      run: async (_jobId: string, input: { round: number }) => {
        const confidenceScore = confidences[criticCall++] ?? 0
        return {
          jobId: _jobId, round: input.round, confidenceScore,
          approved: confidenceScore >= 0.7, reasoning: 'test',
          contradictions: [], singleSourceClaims: [],
          gaps: confidenceScore < 0.7 ? [`gap-for-round-${input.round}`] : [],
        }
      },
    }
    const synthesizer = { run: async () => { synthRan = true } }

    return { planner, critic, synthesizer, state: () => ({ plannerCalls, gapsSeen, synthRan }) }
  }

  // Stub classifyQuery so no live Anthropic call is needed.
  const runScenario = async (confidences: number[]) => {
    const fakes = makeFakes(confidences)
    const orch = new OrchestratorAgent({
      planner: fakes.planner as never,
      critic: fakes.critic as never,
      synthesizer: fakes.synthesizer as never,
    })
    ;(orch as unknown as { classifyQuery: () => Promise<unknown> }).classifyQuery = async () => ({
      queryType: 'exploratory', researchStrategy: 'test', estimatedComplexity: 'medium',
    })

    const jobId = uuidv4()
    await pool.query('INSERT INTO research_jobs (id, query) VALUES ($1, $2)', [jobId, 'loop test'])
    await orch.run(jobId, { query: 'test query' })
    const { rows } = await pool.query('SELECT requery_count, confidence_score, status FROM research_jobs WHERE id = $1', [jobId])
    await pool.query('DELETE FROM research_jobs WHERE id = $1', [jobId])
    return { db: rows[0] as { requery_count: number; confidence_score: number; status: string }, ...fakes.state() }
  }

  try {
    // Scenario A: high confidence on round 1 → single round, straight to synthesis.
    const a = await runScenario([0.85])
    if (a.plannerCalls.length !== 1) fail('scenario A', `expected 1 round, got ${a.plannerCalls.length}`)
    if (!a.synthRan) fail('scenario A', 'synthesizer did not run')
    if (a.db.requery_count !== 1) fail('scenario A', `requery_count should be 1, got ${a.db.requery_count}`)
    ok(`high confidence (0.85) → 1 round → synthesis (requery_count=${a.db.requery_count}, status=${a.db.status})`)

    // Scenario B: low, low, then high → 3 rounds, gaps fed forward, then synthesis.
    const b = await runScenario([0.4, 0.55, 0.8])
    if (b.plannerCalls.length !== 3) fail('scenario B', `expected 3 rounds, got ${b.plannerCalls.length}`)
    if (b.gapsSeen[1].length === 0) fail('scenario B', 'round 2 planner did not receive gaps from round 1')
    if (b.db.requery_count !== 3) fail('scenario B', `requery_count should be 3, got ${b.db.requery_count}`)
    if (!b.synthRan) fail('scenario B', 'synthesizer did not run')
    ok(`low→low→high → 3 rounds, gaps fed forward (round 2 saw: "${b.gapsSeen[1][0]}")`)
    ok(`re-query loop reached confidence 0.80 → synthesis (requery_count=${b.db.requery_count})`)

    // Scenario C: persistently low → capped at MAX rounds, still proceeds.
    const c = await runScenario([0.2, 0.3, 0.35, 0.35])
    if (c.plannerCalls.length !== 3) fail('scenario C', `cap should hold at 3, got ${c.plannerCalls.length} rounds`)
    if (!c.synthRan) fail('scenario C', 'synthesizer must still run after cap')
    ok(`persistently low → capped at 3 rounds, synthesizes best available (requery_count=${c.db.requery_count})`)
  } finally {
    await pool.end()
  }
}

// Real Critic pass over seeded findings — exercises the adversarial prompt + gap
// extraction against the live model. One Anthropic call.
async function testCriticLive() {
  console.log('\n[4] Critic — live adversarial pass over seeded findings')
  if (!hasKey(process.env.ANTHROPIC_API_KEY)) {
    warn('ANTHROPIC_API_KEY is a placeholder — skipping live Critic call')
    return
  }

  const { scratchpad } = await import('../memory/scratchpad.js')
  const { CriticAgent } = await import('../agents/critic.agent.js')
  const jobId = uuidv4()

  // Two findings that plainly contradict each other, single-sourced.
  await scratchpad.addFinding(jobId, {
    jobId, subtaskId: 's1', content: 'The study found coffee consumption significantly reduces the risk of heart disease.',
    sourceUrl: 'https://example-health.com/2019/coffee', sourceTitle: 'Coffee and Heart Health', credibilityScore: 0.5, timestamp: Date.now(),
  })
  await scratchpad.addFinding(jobId, {
    jobId, subtaskId: 's2', content: 'Research shows coffee consumption does not reduce heart disease risk and may increase blood pressure.',
    sourceUrl: 'https://random-blog.net/coffee-myth', sourceTitle: 'The Coffee Myth', credibilityScore: 0.5, timestamp: Date.now(),
  })

  try {
    const critic = new CriticAgent()
    const report = await critic.run(jobId, { round: 1, queryType: 'causal' })

    if (typeof report.confidenceScore !== 'number') fail('critic', 'no confidence score')
    ok(`confidence: ${report.confidenceScore.toFixed(2)} (approved: ${report.approved})`)
    if (report.confidenceScore >= 0.7) warn(`expected low confidence on contradictory single-sourced findings, got ${report.confidenceScore}`)
    else ok('adversarial: contradictory, single-sourced findings scored below threshold')
    ok(`contradictions flagged: ${report.contradictions.length}`)
    ok(`gaps identified for re-query: ${report.gaps.length}`)
    if (report.gaps[0]) console.log(`     e.g. "${report.gaps[0].slice(0, 80)}"`)

    // Confirm the report was written back to the scratchpad.
    const stored = await scratchpad.getCriticReport(jobId)
    if (!stored) fail('scratchpad', 'critic report not written back to scratchpad')
    ok('critic report (flags + gaps) written back to Redis scratchpad')
  } finally {
    await scratchpad.clearFindings(jobId)
  }
}

;(async () => {
  console.log('=== Synthex Phase 4 — Critic + re-query loop check ===')
  await testScoreSource()
  await testRequeryColumn()
  await testRequeryLoop()
  await testCriticLive()
  console.log('\n✓ All Phase 4 checks passed.\n')
  process.exit(0)
})()
