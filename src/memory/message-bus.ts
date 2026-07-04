import { EventEmitter } from 'events'
import { AgentEvent } from '@synthex/shared/types/agent.types'

class MessageBus extends EventEmitter {
  publish(jobId: string, event: AgentEvent) {
    this.emit(`job:${jobId}`, event)
  }
}

export const messageBus = new MessageBus()
messageBus.setMaxListeners(50)
