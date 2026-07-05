import './env.js'
import express from 'express'
import cors from 'cors'
import { researchRouter } from './routes/research.route.js'
import { streamRouter } from './routes/stream.route.js'
import { historyRouter } from './routes/history.route.js'
import './queue/worker.js'

const app = express()
const PORT = process.env.PORT ?? 3000

// CORS must allow the FRONTEND's origin (the Vite dev server / deployed web app),
// not the API's own URL. WEB_ORIGIN defaults to the local Vite dev server.
app.use(cors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173' }))
app.use(express.json())

app.use('/api/research', researchRouter)
app.use('/api/stream', streamRouter)
app.use('/api/history', historyRouter)

app.get('/health', (_req, res) => res.json({ status: 'ok' }))

app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`)
})
