import { Router, Request, Response } from 'express'
import { v4 as uuidv4 } from 'uuid'
import pool from '../db/client.js'
import { OrchestratorAgent } from '../agents/orchestrator.agent.js'

export const researchRouter = Router()

researchRouter.post('/', async (req: Request, res: Response) => {
  const { query } = req.body as { query?: string }
  if (!query?.trim()) {
    res.status(400).json({ error: 'query is required' })
    return
  }

  const jobId = uuidv4()
  await pool.query('INSERT INTO research_jobs (id, query) VALUES ($1, $2)', [jobId, query.trim()])

  const orchestrator = new OrchestratorAgent()
  orchestrator.run(jobId, { query: query.trim() }).catch((err) =>
    console.error(`[orchestrator] job ${jobId} failed:`, err)
  )

  res.status(202).json({ jobId })
})
