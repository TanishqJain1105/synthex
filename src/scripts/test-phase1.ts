import 'dotenv/config'
import { Pool } from 'pg'
import { createClient } from 'redis'
import { Queue, Worker } from 'bullmq'

const ok = (label: string) => console.log(`  ✓ ${label}`)
const fail = (label: string, err: unknown) => { console.error(`  ✗ ${label}:`, err); process.exit(1) }

async function checkPostgres() {
  console.log('\n[1] PostgreSQL')
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  try {
    const { rows } = await pool.query('SELECT version()')
    ok(`connected — ${(rows[0] as { version: string }).version.split(' ').slice(0, 2).join(' ')}`)

    const { rows: ext } = await pool.query(`SELECT extname, extversion FROM pg_extension WHERE extname = 'vector'`)
    if (ext.length === 0) fail('pgvector', 'extension not found — did you run schema.sql?')
    ok(`pgvector ${(ext[0] as { extversion: string }).extversion} extension present`)

    await pool.query(`SELECT COUNT(*) FROM research_jobs`)
    ok('research_jobs table exists')
    await pool.query(`SELECT COUNT(*) FROM research_chunks`)
    ok('research_chunks table exists')
    await pool.query(`SELECT COUNT(*) FROM reports`)
    ok('reports table exists')

    const testEmbed = JSON.stringify(new Array(1536).fill(0.1))
    await pool.query(`SELECT $1::vector <=> $1::vector AS distance`, [testEmbed])
    ok('pgvector cosine op (<=>) works')
  } finally {
    await pool.end()
  }
}

async function checkRedis() {
  console.log('\n[2] Redis')
  const client = createClient({ url: process.env.REDIS_URL })
  try {
    await client.connect()
    const pong = await client.ping()
    ok(`connected — PING → ${pong}`)
    await client.set('synthex:phase1-test', 'ok', { EX: 10 })
    const val = await client.get('synthex:phase1-test')
    ok(`read/write — got "${val}"`)
  } finally {
    await client.disconnect()
  }
}

async function checkQueue() {
  console.log('\n[3] BullMQ queue')
  const connection = { url: process.env.REDIS_URL ?? 'redis://localhost:6379' }
  const queue = new Queue('research', { connection })

  try {
    const job = await queue.add('phase1-test', { jobId: 'test-000', subtaskId: 'sub-1', query: 'hello world', searchStrategy: 'web' })
    ok(`enqueued dummy job — id: ${job.id}`)

    const counts = await queue.getJobCounts()
    ok(`queue state: ${JSON.stringify(counts)}`)

    await job.remove()
    ok('dummy job cleaned up')
  } finally {
    await queue.close()
  }
}

async function checkExpressImport() {
  console.log('\n[4] Express app module')
  try {
    const { default: express } = await import('express')
    const app = express()
    ok(`express ${(express as unknown as { version?: string }).version ?? 'v5'} imported and initialised`)
    void app
  } catch (err) {
    fail('express import', err)
  }
}

;(async () => {
  console.log('=== Synthex Phase 1 — foundation check ===')
  await checkPostgres()
  await checkRedis()
  await checkQueue()
  await checkExpressImport()
  console.log('\n✓ All Phase 1 checks passed.\n')
  process.exit(0)
})()
