import { Queue } from 'bullmq'
import { JobPayload } from './job-types.js'

export const researchQueue = new Queue<JobPayload>('research', {
  connection: { url: process.env.REDIS_URL ?? 'redis://localhost:6379' },
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
})
