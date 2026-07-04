import { Router, Request, Response } from 'express'
import { messageBus } from '../memory/message-bus.js'
import { AgentEvent } from '@synthex/shared/types/agent.types'

export const streamRouter = Router()

streamRouter.get('/:jobId', (req: Request, res: Response) => {
  const { jobId } = req.params

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const send = (event: AgentEvent) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`)
  }

  messageBus.on(`job:${jobId}`, send)

  req.on('close', () => {
    messageBus.off(`job:${jobId}`, send)
  })
})
