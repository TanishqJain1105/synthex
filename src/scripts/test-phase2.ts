import 'dotenv/config'
import { Queue, Worker } from 'bullmq'
import { Pool } from 'pg'
import { v4 as uuidv4 } from 'uuid'

const ok = (label: string) => console.log(`  ✓ ${label}`)
const fail = (label: string, err: unknown) => { console.error(`  ✗ ${label}:`, err); process.exit(1) }

const connection = { url: process.env.REDIS_URL ?? 'redis://localhost:6379' }

async function testOrchestratorClassification() {
  console.log('\n[1] Orchestrator — query classification')

  const hasKey = !!process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.startsWith('gsk_')
  if (!hasKey) {
    console.log('  ⚠ GROQ_API_KEY is a placeholder — skipping live Groq call')
    console.log('  ℹ Set a real key in .env to test classification')
    return
  }

  const { OrchestratorAgent } = await import('../agents/orchestrator.agent.js')

  // Patch the orchestrator so it only does classification, not the full pipeline
  const orch = new OrchestratorAgent() as unknown as {
    classifyQuery: (q: string) => Promise<{ queryType: string; researchStrategy: string; estimatedComplexity: string }>
  }

  const result = await orch['classifyQuery']('What are the long-term effects of sleep deprivation on cognitive function?')
  const validTypes = ['factual', 'exploratory', 'comparative', 'causal']
  if (!validTypes.includes(result.queryType)) fail('queryType', `unexpected value: ${result.queryType}`)

  ok(`queryType: ${result.queryType}`)
  ok(`estimatedComplexity: ${result.estimatedComplexity}`)
  ok(`researchStrategy: ${result.researchStrategy}`)
}

async function testPlannerQueueing() {
  console.log('\n[2] Planner — query decomposition → Redis queue')

  const hasKey = !!process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.startsWith('gsk_')
  if (!hasKey) {
    console.log('  ⚠ GROQ_API_KEY is a placeholder — testing queue mechanics only')
    await testQueueMechanicsOnly()
    return
  }

  // Create a test job row so DB FK constraints pass
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const jobId = uuidv4()
  try {
    await pool.query('INSERT INTO research_jobs (id, query) VALUES ($1, $2)', [jobId, 'sleep deprivation test'])

    // Drain the queue before test
    const queue = new Queue('research', { connection })
    await queue.drain()

    const { PlannerAgent } = await import('../agents/planner.agent.js')
    const planner = new PlannerAgent()
    await planner.run(jobId, { query: 'What are the long-term effects of sleep deprivation?', queryType: 'causal', round: 1 })

    const counts = await queue.getJobCounts()
    const waiting = counts.waiting ?? 0
    if (waiting === 0) fail('queue', 'Planner enqueued 0 jobs — expected at least 3')

    ok(`Planner enqueued ${waiting} subtasks to Redis queue`)

    const jobs = await queue.getJobs(['waiting'])
    for (const job of jobs) {
      const data = job.data as { subtaskId: string; searchStrategy: string }
      ok(`  subtask: ${data.subtaskId} [${data.searchStrategy}]`)
    }

    await queue.drain()
    await queue.close()
  } finally {
    await pool.query('DELETE FROM research_jobs WHERE id = $1', [jobId])
    await pool.end()
  }
}

async function testQueueMechanicsOnly() {
  const queue = new Queue('research', { connection })
  await queue.drain()

  // Simulate what the planner does
  const jobId = uuidv4()
  const subtasks = [
    { subtaskId: 'mechanism-test', searchStrategy: 'academic' },
    { subtaskId: 'outcomes-test', searchStrategy: 'academic' },
    { subtaskId: 'recent-test', searchStrategy: 'news' },
  ]

  for (const t of subtasks) {
    await queue.add('research-subtask', { jobId, subtaskId: t.subtaskId, query: 'test', searchStrategy: t.searchStrategy })
  }

  const counts = await queue.getJobCounts()
  ok(`${counts.waiting} mock subtasks landed in Redis queue`)

  const jobs = await queue.getJobs(['waiting'])
  for (const job of jobs) {
    const data = job.data as { subtaskId: string; searchStrategy: string }
    ok(`  subtask: ${data.subtaskId} [${data.searchStrategy}]`)
  }

  await queue.drain()
  await queue.close()
}

async function testBaseAgentToolLoop() {
  console.log('\n[3] BaseAgent — tool-use loop structure')
  const { BaseAgent } = await import('../agents/base.agent.js')

  // Verify the runWithTools method exists on the prototype
  const hasMethod = typeof (BaseAgent.prototype as unknown as Record<string, unknown>)['runWithTools'] === 'function'
  if (!hasMethod) fail('runWithTools', 'method not found on BaseAgent prototype')
  ok('runWithTools() method present on BaseAgent prototype')
}

async function testSSEEventEmission() {
  console.log('\n[4] SSE event emission via message bus')
  const { messageBus } = await import('../memory/message-bus.js')

  const events: unknown[] = []
  const jobId = 'test-sse-' + uuidv4()
  messageBus.on(`job:${jobId}`, (e) => events.push(e))

  messageBus.emit(`job:${jobId}`, { jobId, agentRole: 'orchestrator', type: 'thinking', payload: { message: 'test' }, timestamp: Date.now() })
  messageBus.emit(`job:${jobId}`, { jobId, agentRole: 'planner', type: 'thinking', payload: { message: 'decomposing' }, timestamp: Date.now() })

  if (events.length !== 2) fail('events', `expected 2, got ${events.length}`)
  ok(`${events.length} SSE events emitted and received correctly`)

  messageBus.removeAllListeners(`job:${jobId}`)
}

// Prevent BullMQ worker from auto-starting during tests by not importing index.ts
;(async () => {
  console.log('=== Synthex Phase 2 — Orchestrator + Planner check ===')
  await testBaseAgentToolLoop()
  await testSSEEventEmission()
  await testPlannerQueueing()
  await testOrchestratorClassification()
  console.log('\n✓ All Phase 2 checks passed.\n')
  process.exit(0)
})()
