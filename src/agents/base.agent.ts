import Groq from 'groq-sdk'
import { AgentEvent, AgentRole } from '@synthex/shared/types/agent.types'
import { messageBus } from '../memory/message-bus.js'

// Groq exposes an OpenAI-compatible chat-completions API. One shared default
// model for every agent, overridable via GROQ_MODEL. llama-3.3-70b-versatile is
// a production Groq model with tool-use + streaming and a 128k context window.
export const GROQ_MODEL = process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile'

export abstract class BaseAgent {
  protected client: Groq
  protected role: AgentRole

  constructor(role: AgentRole) {
    this.role = role
    this.client = new Groq({ apiKey: process.env.GROQ_API_KEY })
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

  // Agentic tool-use loop: call Groq → execute the model's tool_calls → feed
  // results back → repeat until the model stops requesting tools. Emits SSE
  // events after every step. Uses OpenAI-style function calling (Groq-compatible).
  protected async runWithTools(
    jobId: string,
    system: string,
    userMessage: string,
    tools: Groq.Chat.Completions.ChatCompletionTool[],
    toolHandlers: Record<string, (input: Record<string, unknown>) => Promise<unknown>>,
  ): Promise<string> {
    const messages: Groq.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: system },
      { role: 'user', content: userMessage },
    ]

    for (;;) {
      const response = await this.client.chat.completions.create({
        model: GROQ_MODEL,
        max_tokens: 4096,
        tools,
        messages,
      })

      const message = response.choices[0]?.message
      const toolCalls = message?.tool_calls ?? []

      // No tool calls → the model produced its final answer.
      if (toolCalls.length === 0) {
        return message?.content ?? ''
      }

      // Record the assistant turn that requested the tools before answering them.
      messages.push({ role: 'assistant', content: message?.content ?? '', tool_calls: toolCalls })

      for (const call of toolCalls) {
        const name = call.function.name
        this.emit(jobId, { type: 'tool_call', payload: { tool: name, input: call.function.arguments } })

        let result: unknown
        try {
          const handler = toolHandlers[name]
          if (!handler) throw new Error(`No handler registered for tool: ${name}`)
          // Groq returns tool arguments as a JSON string — parse before dispatch.
          const args = call.function.arguments ? JSON.parse(call.function.arguments) : {}
          result = await handler(args as Record<string, unknown>)
          this.emit(jobId, { type: 'tool_result', payload: { tool: name, result } })
        } catch (err) {
          result = { error: (err as Error).message }
          this.emit(jobId, { type: 'error', payload: { tool: name, error: (err as Error).message } })
        }

        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(result),
        })
      }
    }
  }

  abstract run(jobId: string, input: unknown): Promise<unknown>
}
