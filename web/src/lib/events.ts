import { AgentEvent, AgentEventType } from '@synthex/shared/types/agent.types'

export type UiAgentStatus = 'idle' | 'thinking' | 'running' | 'done' | 'error'

// Map a raw event type onto the coarse status a card should show. The special
// case of a `report_chunk` carrying `{ done: true }` is handled by the caller.
export function statusForEvent(type: AgentEventType): UiAgentStatus {
  switch (type) {
    case 'thinking':
      return 'thinking'
    case 'done':
      return 'done'
    case 'error':
      return 'error'
    default:
      return 'running' // tool_call | tool_result | finding | score | report_chunk
  }
}

const TOOL_LABEL: Record<string, string> = {
  web_search: 'Web search',
  arxiv_search: 'ArXiv search',
  search: 'Search',
  scrape_url: 'Scrape',
  embed_chunk: 'Embed',
  rag_retrieve: 'RAG retrieve',
  score_source: 'Score source',
}

function prettyTool(tool: string): string {
  return TOOL_LABEL[tool] ?? tool.replace(/_/g, ' ')
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}

// A single human-readable line for an event — reused by both the agent cards
// (last action) and the live feed, so they always agree.
export function describeEvent(e: AgentEvent): string {
  const p = e.payload
  switch (e.type) {
    case 'thinking':
      return String(p.message ?? 'Thinking…')

    case 'tool_call': {
      const tool = prettyTool(String(p.tool ?? 'tool'))
      const arg = p.query ?? p.url
      if (typeof arg === 'string') return `${tool} · ${truncate(arg, 64)}`
      if (typeof p.length === 'number') return `${tool} · ${p.length} chars`
      return tool
    }

    case 'tool_result': {
      const tool = prettyTool(String(p.tool ?? 'tool'))
      if (typeof p.count === 'number') return `${tool} → ${p.count} results`
      if (typeof p.chunksEmbedded === 'number') return `Embedded ${p.chunksEmbedded} chunks`
      if (typeof p.chunksRetrieved === 'number') return `Retrieved ${p.chunksRetrieved} chunks`
      return `${tool} done`
    }

    case 'finding': {
      const f = p.finding as { sourceTitle?: string } | undefined
      return f?.sourceTitle ? `Found · ${truncate(f.sourceTitle, 64)}` : 'New finding'
    }

    case 'score': {
      const s = Number(p.confidenceScore ?? 0)
      const verdict = p.approved ? 'approved' : 'needs more'
      return `Confidence ${Math.round(s * 100)}% · ${verdict}`
    }

    case 'report_chunk':
      return p.done ? 'Report complete' : 'Writing report…'

    case 'done':
      return `Research complete · confidence ${Math.round(Number(p.confidence ?? 0) * 100)}%`

    case 'error':
      return `Error · ${truncate(String(p.error ?? 'unknown'), 64)}`

    default:
      return e.type
  }
}

// Small glyph per event type for the feed's left gutter.
export const EVENT_GLYPH: Record<AgentEventType, string> = {
  thinking: '◇',
  tool_call: '▸',
  tool_result: '✓',
  finding: '❋',
  score: '◎',
  report_chunk: '✎',
  done: '★',
  error: '⚠',
}
