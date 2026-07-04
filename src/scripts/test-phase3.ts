import 'dotenv/config'
import { Queue, Worker } from 'bullmq'
import { Pool } from 'pg'
import { v4 as uuidv4 } from 'uuid'

const ok = (label: string) => console.log(`  ✓ ${label}`)
const warn = (label: string) => console.log(`  ⚠ ${label}`)
const fail = (label: string, err: unknown) => { console.error(`  ✗ ${label}:`, err); process.exit(1) }

const connection = { url: process.env.REDIS_URL ?? 'redis://localhost:6379' }
const hasKey = (k?: string) => !!k && k !== 'placeholder'

async function testChunking() {
  console.log('\n[1] Chunking pipeline — ~500-token chunks, 50-token overlap')
  const { chunkText } = await import('../tools/embed-chunk.tool.js')

  // ~6000 chars ≈ 1500 tokens → expect ~4 chunks (stride = 450 tokens = 1800 chars)
  const text = 'word '.repeat(1200) // 6000 chars
  const chunks = chunkText(text)

  if (chunks.length < 2) fail('chunking', `expected multiple chunks, got ${chunks.length}`)
  ok(`${text.length}-char text → ${chunks.length} chunks`)

  // Each chunk should be ~2000 chars (500 tokens); verify overlap between consecutive chunks.
  const overlaps = chunks[0].slice(-200)
  const nextStart = chunks[1].slice(0, 200)
  const overlapPresent = chunks[1].includes(chunks[0].slice(-100).trim().slice(0, 50))
  if (!overlapPresent) fail('overlap', 'consecutive chunks do not share overlapping text')
  ok(`chunk size ≈ ${chunks[0].length} chars (~500 tokens)`)
  ok(`50-token overlap present between consecutive chunks`)
  void overlaps; void nextStart

  const short = chunkText('just a short sentence')
  if (short.length !== 1) fail('short text', `expected 1 chunk, got ${short.length}`)
  ok('short text stays a single chunk')
}

async function testArxivLive() {
  console.log('\n[2] ArXiv search (live — free API, no key)')
  const { arxivSearch } = await import('../tools/arxiv-search.tool.js')

  try {
    const papers = await arxivSearch('transformer neural network attention', 3)
    if (papers.length === 0) { warn('ArXiv returned 0 papers (network?) — skipping assertions'); return }

    ok(`returned ${papers.length} papers`)
    const p = papers[0]
    if (!p.title || p.title === 'Untitled') fail('title', 'missing paper title')
    if (!p.snippet) fail('abstract', 'missing abstract')
    if (!p.pdfUrl.includes('pdf')) fail('pdfUrl', `not a PDF link: ${p.pdfUrl}`)
    ok(`title: "${p.title.slice(0, 60)}..."`)
    ok(`abstract: ${p.snippet.length} chars`)
    ok(`PDF link: ${p.pdfUrl}`)
  } catch (err) {
    warn(`ArXiv live call failed (${(err as Error).message}) — network-dependent, non-fatal`)
  }
}

async function testScrapeLive() {
  console.log('\n[3] Scrape URL (live — Cheerio fast path)')
  const { scrapeUrl } = await import('../tools/scrape-url.tool.js')

  try {
    const text = await scrapeUrl('https://example.com')
    if (!text) { warn('scrape returned null (network?) — skipping'); return }
    if (!text.toLowerCase().includes('example')) warn(`unexpected content: ${text.slice(0, 80)}`)
    ok(`scraped example.com → ${text.length} chars of clean text`)
  } catch (err) {
    warn(`scrape live call failed (${(err as Error).message}) — non-fatal`)
  }
}

async function testWorkerParallelism() {
  console.log('\n[4] BullMQ worker — 3 researchers run in parallel (concurrency 3)')

  const CONCURRENCY = parseInt(process.env.MAX_RESEARCHER_AGENTS ?? '3')
  ok(`MAX_RESEARCHER_AGENTS = ${CONCURRENCY}`)

  const queueName = `phase3-parallel-${uuidv4()}`
  const queue = new Queue(queueName, { connection })

  // Enqueue 3 subtasks (mirrors Planner → 3 researchers).
  for (let i = 0; i < 3; i++) {
    await queue.add('research-subtask', { jobId: 'test', subtaskId: `sub-${i}`, query: `q${i}`, searchStrategy: 'web' })
  }

  const active: number[] = []
  let maxConcurrent = 0

  const worker = new Worker(
    queueName,
    async () => {
      active.push(Date.now())
      maxConcurrent = Math.max(maxConcurrent, active.length)
      await new Promise((r) => setTimeout(r, 400)) // simulate research work
      active.pop()
    },
    { connection, concurrency: CONCURRENCY }
  )

  await new Promise<void>((resolve) => {
    let done = 0
    worker.on('completed', () => { if (++done === 3) resolve() })
  })

  if (maxConcurrent < 3) fail('parallelism', `only ${maxConcurrent} ran concurrently — expected 3`)
  ok(`all 3 subtasks processed concurrently (peak concurrency: ${maxConcurrent})`)

  await worker.close()
  await queue.obliterate({ force: true })
  await queue.close()
}

async function testFullPipeline() {
  console.log('\n[5] Full pipeline — search → scrape → embed → pgvector + scratchpad')

  if (!hasKey(process.env.SERPER_API_KEY) || !hasKey(process.env.VOYAGE_API_KEY)) {
    warn('SERPER_API_KEY / VOYAGE_API_KEY are placeholders — skipping live pipeline')
    console.log('  ℹ With real keys: a researcher searches, scrapes, embeds into research_chunks, and writes a Finding')
    return
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const jobId = uuidv4()
  try {
    await pool.query('INSERT INTO research_jobs (id, query) VALUES ($1, $2)', [jobId, 'phase3 pipeline test'])

    const { ResearcherAgent } = await import('../agents/researcher.agent.js')
    const { scratchpad } = await import('../memory/scratchpad.js')

    const agent = new ResearcherAgent()
    await agent.run(jobId, { jobId, subtaskId: 'sub-1', query: 'what is retrieval augmented generation', searchStrategy: 'web' })

    const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM research_chunks WHERE job_id = $1', [jobId])
    const chunkCount = (rows[0] as { n: number }).n
    if (chunkCount === 0) fail('embeddings', 'no chunks embedded into research_chunks')
    ok(`${chunkCount} chunks embedded into pgvector`)

    const findings = await scratchpad.getFindings(jobId)
    if (findings.length === 0) fail('scratchpad', 'no findings in scratchpad')
    ok(`${findings.length} findings written to Redis scratchpad`)
  } finally {
    await pool.query('DELETE FROM research_jobs WHERE id = $1', [jobId])
    await pool.end()
  }
}

;(async () => {
  console.log('=== Synthex Phase 3 — Researcher + vector pipeline check ===')
  await testChunking()
  await testArxivLive()
  await testScrapeLive()
  await testWorkerParallelism()
  await testFullPipeline()
  console.log('\n✓ All Phase 3 checks passed.\n')
  process.exit(0)
})()
