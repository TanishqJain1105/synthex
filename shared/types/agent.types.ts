export type AgentRole = 'orchestrator' | 'planner' | 'researcher' | 'critic' | 'synthesizer'

export type AgentStatus = 'idle' | 'running' | 'done' | 'error'

export type AgentEventType =
  | 'thinking'
  | 'tool_call'
  | 'tool_result'
  | 'finding'
  | 'score'
  | 'report_chunk'
  | 'done'
  | 'error'

export type AgentEvent = {
  jobId: string
  agentRole: AgentRole
  type: AgentEventType
  payload: Record<string, unknown>
  timestamp: number
}
