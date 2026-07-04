import { createClient } from 'redis'
import { Finding, CriticReport } from '@synthex/shared/types/research.types'

const client = createClient({ url: process.env.REDIS_URL ?? 'redis://localhost:6379' })
client.connect().catch(console.error)

const findingsKey = (jobId: string) => `scratchpad:${jobId}:findings`
const criticKey = (jobId: string) => `scratchpad:${jobId}:critic`

export const scratchpad = {
  async addFinding(jobId: string, finding: Finding): Promise<void> {
    await client.rPush(findingsKey(jobId), JSON.stringify(finding))
    await client.expire(findingsKey(jobId), 3600)
  },

  async getFindings(jobId: string): Promise<Finding[]> {
    const raw = await client.lRange(findingsKey(jobId), 0, -1)
    return raw.map((r) => JSON.parse(r) as Finding)
  },

  async clearFindings(jobId: string): Promise<void> {
    await client.del(findingsKey(jobId))
  },

  // The Critic writes its contradiction flags / gaps / score back here so the
  // Orchestrator (and a curious frontend) can read the latest adversarial pass.
  async setCriticReport(jobId: string, report: CriticReport): Promise<void> {
    await client.set(criticKey(jobId), JSON.stringify(report), { EX: 3600 })
  },

  async getCriticReport(jobId: string): Promise<CriticReport | null> {
    const raw = await client.get(criticKey(jobId))
    return raw ? (JSON.parse(raw) as CriticReport) : null
  },
}
