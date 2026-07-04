import { create } from 'zustand'
import { AgentEvent, AgentRole } from '@synthex/shared/types/agent.types'
import { Report, Citation } from '@synthex/shared/types/research.types'
import { ROLES } from '../lib/agents'
import { UiAgentStatus, describeEvent, statusForEvent } from '../lib/events'

export type Theme = 'light' | 'dark'

export type HistoryItem = {
  id: string
  query: string
  status: string
  confidence_score: number | null
  created_at: string
  report_id?: string | null
}

// Per-agent bucket the cards render from. `useAgentStream` funnels every event
// into these buckets via `addEvent`, so categorisation lives in one place.
export type AgentState = {
  status: UiAgentStatus
  lastAction: string
  startedAt: number | null
  updatedAt: number | null
  eventCount: number
}

function initialAgents(): Record<AgentRole, AgentState> {
  return Object.fromEntries(
    ROLES.map((r) => [r, { status: 'idle', lastAction: '', startedAt: null, updatedAt: null, eventCount: 0 }])
  ) as Record<AgentRole, AgentState>
}

type ResearchStore = {
  theme: Theme
  toggleTheme: () => void

  jobId: string | null
  query: string
  events: AgentEvent[]
  agents: Record<AgentRole, AgentState>

  // Live report is accumulated from streaming `report_chunk` events; `report`
  // is a persisted report fetched for a historical job. The viewer prefers
  // `report` when present and falls back to the live stream.
  reportContent: string
  report: Report | null
  citations: Citation[]
  knowledgeGaps: string[]
  confidenceScore: number | null
  approved: boolean

  history: HistoryItem[]
  isLoading: boolean
  isDone: boolean
  error: string | null

  setQuery: (q: string) => void
  setJobId: (id: string) => void
  addEvent: (e: AgentEvent) => void
  setReport: (r: Report) => void
  setHistory: (h: HistoryItem[]) => void
  setLoading: (v: boolean) => void
  setError: (e: string | null) => void
  reset: () => void
}

// Read the persisted theme once, defaulting to Mocha (dark).
function initialTheme(): Theme {
  if (typeof localStorage === 'undefined') return 'dark'
  return (localStorage.getItem('synthex-theme') as Theme) || 'dark'
}

export const useResearchStore = create<ResearchStore>((set) => ({
  theme: initialTheme(),
  toggleTheme: () =>
    set((state) => {
      const next: Theme = state.theme === 'dark' ? 'light' : 'dark'
      document.documentElement.classList.toggle('dark', next === 'dark')
      localStorage.setItem('synthex-theme', next)
      return { theme: next }
    }),

  jobId: null,
  query: '',
  events: [],
  agents: initialAgents(),
  reportContent: '',
  report: null,
  citations: [],
  knowledgeGaps: [],
  confidenceScore: null,
  approved: false,
  history: [],
  isLoading: false,
  isDone: false,
  error: null,

  setQuery: (query) => set({ query }),
  setJobId: (jobId) => set({ jobId }),

  addEvent: (e) =>
    set((s) => {
      const events = [...s.events, e]
      const agents = { ...s.agents }
      const prev = agents[e.agentRole]

      // Derive this agent's new status. A final report chunk means the
      // synthesizer is done, not merely "running".
      let status = statusForEvent(e.type)
      if (e.type === 'report_chunk' && e.payload.done) status = 'done'

      agents[e.agentRole] = {
        status,
        lastAction: describeEvent(e),
        startedAt: prev.startedAt ?? e.timestamp,
        updatedAt: e.timestamp,
        eventCount: prev.eventCount + 1,
      }

      const patch: Partial<ResearchStore> = { events, agents }

      // Accumulate the streamed report + capture citations/gaps on completion.
      if (e.type === 'report_chunk') {
        if (e.payload.done) {
          if (Array.isArray(e.payload.citations)) patch.citations = e.payload.citations as Citation[]
          if (Array.isArray(e.payload.knowledgeGaps)) patch.knowledgeGaps = e.payload.knowledgeGaps as string[]
          if (typeof e.payload.confidence === 'number') patch.confidenceScore = e.payload.confidence
          patch.approved = Boolean(e.payload.approved)
        } else if (typeof e.payload.chunk === 'string') {
          patch.reportContent = s.reportContent + e.payload.chunk
        }
      }

      // The Critic's score is the live confidence signal before the report lands.
      if (e.type === 'score') {
        if (typeof e.payload.confidenceScore === 'number') patch.confidenceScore = e.payload.confidenceScore
        if (Array.isArray(e.payload.gaps)) patch.knowledgeGaps = e.payload.gaps as string[]
        patch.approved = Boolean(e.payload.approved)
      }

      // The orchestrator's `done` marks the whole job finished. No other agent
      // emits `done`, so flip every agent that ran (and didn't error) to done.
      if (e.type === 'done') {
        if (typeof e.payload.confidence === 'number') patch.confidenceScore = e.payload.confidence
        patch.isDone = true
        for (const r of ROLES) {
          if (agents[r].status !== 'idle' && agents[r].status !== 'error') {
            agents[r] = { ...agents[r], status: 'done' }
          }
        }
      }

      return patch
    }),

  setReport: (report) => set({ report }),
  setHistory: (history) => set({ history }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),

  reset: () =>
    set({
      jobId: null,
      events: [],
      agents: initialAgents(),
      reportContent: '',
      report: null,
      citations: [],
      knowledgeGaps: [],
      confidenceScore: null,
      approved: false,
      isLoading: false,
      isDone: false,
      error: null,
    }),
}))

// Apply the persisted theme to <html> as early as this module is imported, so
// the first paint already matches the saved Latte/Mocha choice.
if (typeof document !== 'undefined') {
  const savedTheme = (typeof localStorage !== 'undefined' && localStorage.getItem('synthex-theme')) || 'dark'
  document.documentElement.classList.toggle('dark', savedTheme === 'dark')
}
