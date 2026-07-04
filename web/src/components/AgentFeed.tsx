import { useEffect, useRef } from 'react'
import { AgentEvent } from '@synthex/shared/types/agent.types'
import { useResearchStore } from '../stores/research.store'
import { ROLE_LABEL, ROLE_TEXT, ROLE_VAR } from '../lib/agents'
import { EVENT_GLYPH, describeEvent } from '../lib/events'

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour12: false, minute: '2-digit', second: '2-digit' })
}

// The live activity log — every agent event, oldest at the top, newest at the
// bottom, auto-scrolling as it fills. The centrepiece: five agents narrating
// their work in real time.
export function AgentFeed() {
  const events = useResearchStore((s) => s.events)

  // Individual streamed report tokens would drown the feed — collapse them and
  // keep only the "complete" marker.
  const rows = events.filter((e) => !(e.type === 'report_chunk' && !e.payload.done))

  const bottomRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [rows.length])

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <h2 className="font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">Activity</h2>
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{rows.length} events</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {rows.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">Waiting for the agents to start…</p>
        ) : (
          <ol className="space-y-0.5">
            {rows.map((e, i) => (
              <FeedRow key={i} event={e} />
            ))}
          </ol>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}

function FeedRow({ event }: { event: AgentEvent }) {
  const isError = event.type === 'error'
  const railColor = isError ? 'var(--destructive)' : ROLE_VAR[event.agentRole]

  return (
    <li
      className="group flex animate-fade-in-up items-start gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted"
      style={{ borderLeft: `2px solid ${railColor}` }}
    >
      <span className="mt-0.5 select-none text-xs" style={{ color: railColor }}>
        {EVENT_GLYPH[event.type]}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className={`font-mono text-[11px] font-semibold ${ROLE_TEXT[event.agentRole]}`}>
            {ROLE_LABEL[event.agentRole]}
          </span>
          <span className="font-mono text-[10px] tabular-nums text-muted-foreground opacity-70">
            {formatTime(event.timestamp)}
          </span>
        </div>
        <p className={`break-words text-xs leading-snug ${isError ? 'text-destructive' : 'text-muted-foreground'}`}>
          {describeEvent(event)}
        </p>
      </div>
    </li>
  )
}
