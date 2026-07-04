import { Router, Request, Response } from 'express'
import pool from '../db/client.js'

export const historyRouter = Router()

historyRouter.get('/', async (_req: Request, res: Response) => {
  const { rows } = await pool.query(
    `SELECT rj.id, rj.query, rj.status, rj.confidence_score, rj.created_at,
            r.id AS report_id
     FROM research_jobs rj
     LEFT JOIN reports r ON r.job_id = rj.id
     ORDER BY rj.created_at DESC
     LIMIT 50`
  )
  res.json(rows)
})

historyRouter.get('/:jobId/report', async (req: Request, res: Response) => {
  const { rows } = await pool.query(
    'SELECT * FROM reports WHERE job_id = $1',
    [req.params.jobId]
  )
  if (rows.length === 0) {
    res.status(404).json({ error: 'Report not found' })
    return
  }
  res.json(rows[0])
})
