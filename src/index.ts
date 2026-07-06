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
// not the API's own URL. In production, set WEB_ORIGIN to the deployed web origin
// and it's locked to exactly that. In dev, Vite may land on any port (5173, 5174,
// … if earlier ones are taken), so a single hard-coded localhost origin breaks the
// app with a CORS error the moment the port shifts — allow ANY localhost port.
const webOrigin = process.env.WEB_ORIGIN ?? ''
const isLocalhost = (o: string) => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o)
app.use(
  cors({
    origin:
      webOrigin && !isLocalhost(webOrigin)
        ? webOrigin // production: lock to the configured origin
        : (origin, cb) => cb(null, !origin || isLocalhost(origin)), // dev: any localhost port
  })
)
app.use(express.json())

app.use('/api/research', researchRouter)
app.use('/api/stream', streamRouter)
app.use('/api/history', historyRouter)

app.get('/health', (_req, res) => res.json({ status: 'ok' }))

app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`)
})
