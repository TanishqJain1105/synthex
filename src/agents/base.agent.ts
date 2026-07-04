import Anthropic from '@anthropic-ai/sdk'
import { AgentEvent, AgentRole } from '@synthex/shared/types/agent.types'
import { messageBus } from '../memory/message-bus.js'

export abstract class BaseAgent {
  protected client: Anthropic
  protected role: AgentRole

  constructor(role: AgentRole) {
    this.role = role
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }

  protected emit(jobId: string, event: Omit<AgentEvent, 'jobId' | 'agentRole' | 'timestamp'>) {
    const fullEvent: AgentEvent = {
      jobId,
      agentRole: this.role,
      timestamp: Date.now(),
      ...event,
    }
    messageBus.emit(`job:${jobId}`, fullEvent)
  }

  // Agentic tool-use loop: call Claude → execute tool_use blocks → feed results back → repeat
  // until stop_reason is 'end_turn'. Emits SSE events after every step.
  protected async runWithTools(
    jobId: string,
    system: string,
    userMessage: string,
    tools: Anthropic.Tool[],
    toolHandlers: Record<string, (input: Record<string, unknown>) => Promise<unknown>>,
  ): Promise<string> {
    const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userMessage }]

    for (;;) {
      const response = await this.client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system,
        tools,
        messages,
      })

      messages.push({ role: 'assistant', content: response.content })

      if (response.stop_reason === 'end_turn') {
        const text = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text')
        return text?.text ?? ''
      }

      if (response.stop_reason !== 'tool_use') break

      const toolResults: Anthropic.ToolResultBlockParam[] = []

      for (const block of response.content) {
        if (block.type !== 'tool_use') continue

        this.emit(jobId, { type: 'tool_call', payload: { tool: block.name, input: block.input } })

        let result: unknown
        try {
          const handler = toolHandlers[block.name]
          if (!handler) throw new Error(`No handler registered for tool: ${block.name}`)
          result = await handler(block.input as Record<string, unknown>)
          this.emit(jobId, { type: 'tool_result', payload: { tool: block.name, result } })
        } catch (err) {
          result = { error: (err as Error).message }
          this.emit(jobId, { type: 'error', payload: { tool: block.name, error: (err as Error).message } })
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(result),
        })
      }

      messages.push({ role: 'user', content: toolResults })
    }

    return ''
  }

  abstract run(jobId: string, input: unknown): Promise<unknown>
}
