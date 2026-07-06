import { Worker } from 'bullmq'
import { ResearcherAgent } from '../agents/researcher.agent.js'
import { JobPayload } from './job-types.js'

const CONCURRENCY = parseInt(process.env.MAX_RESEARCHER_AGENTS ?? '3')

export const researchWorker = new Worker<JobPayload>(
  'research',
  async (job) => {
    console.log(`[trace] worker picked up subtask=${job.data.subtaskId} job=${job.data.jobId}`)
    const agent = new ResearcherAgent()
    await agent.run(job.data.jobId, job.data)
    console.log(`[trace] worker finished subtask=${job.data.subtaskId} job=${job.data.jobId}`)
  },
  {
    connection: { url: process.env.REDIS_URL ?? 'redis://localhost:6379' },
    concurrency: CONCURRENCY,
  }
)

researchWorker.on('failed', (job, err) => {
  console.error(`[worker] job ${job?.id} failed:`, err.message)
})
