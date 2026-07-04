import { useEffect, useState } from 'react'
import { AgentRole } from '@synthex/shared/types/agent.types'
import { useResearchStore } from '../stores/research.store'
import { ROLE_CHIP, ROLE_LABEL, ROLE_TAGLINE, ROLE_VAR } from '../lib/agents'
import { UiAgentStatus } from '../lib/events'

const STATUS_LABEL: Record<UiAgentStatus, string> = {
  idle: 'Waiting',
  thinking: 'Thinking',
  running: 'Working',
  done: 'Done',
  error: 'Error',
}

// State-driven card surface (border + tinted background).
const STATE_CARD: Record<UiAgentStatus, string> = {
  idle: 'border-border bg-muted opacity-60',
  thinking: 'border-agent-running bg-agent-running-bg',
  running: 'border-agent-running bg-agent-running-bg',
  done: 'border-agent-done bg-agent-done-bg',
  error: 'border-agent-error bg-agent-error-bg',
}

const STATE_TEXT: Record<UiAgentStatus, string> = {
  idle: 'text-muted-foreground',
  thinking: 'text-agent-running',
  running: 'text-agent-running',
  done: 'text-agent-done',
  error: 'text-destructive',
}

// CSS var backing each state — for the pulsing dot + active glow.
const STATE_VAR: Record<UiAgentStatus, string> = {
  idle: 'var(--agent-waiting)',
  thinking: 'var(--agent-running)',
  running: 'var(--agent-running)',
  done: 'var(--agent-done)',
  error: 'var(--agent-error)',
}

// A live-ticking clock, but only while the agent is active — a done/idle card
// freezes its elapsed time instead of re-rendering forever.
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [active])
  return now
}

function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`
}

export function AgentCard({ role }: { role: AgentRole }) {
  const agent = useResearchStore((s) => s.agents[role])
  const active = agent.status === 'thinking' || agent.status === 'running'
  const now = useNow(active)
  const roleVar = ROLE_VAR[role]

  const elapsed =
    agent.startedAt == null
      ? null
      : formatElapsed((active ? now : agent.updatedAt ?? now) - agent.startedAt)

  return (
    <div
      className={`relative overflow-hidden rounded-lg border p-4 transition-all duration-300 ${STATE_CARD[agent.status]}`}
      style={
        active
          ? { boxShadow: `0 0 0 1px ${STATE_VAR[agent.status]}, 0 8px 30px -12px color-mix(in srgb, ${STATE_VAR[agent.status]} 55%, transparent)` }
          : undefined
      }
    >
      {/* Accent rail down the left edge, coloured by the agent's identity. */}
      <span
        className="absolute inset-y-0 left-0 w-1 transition-opacity duration-300"
        style={{ background: roleVar, opacity: active ? 1 : agent.status === 'done' ? 0.5 : 0.2 }}
      />

      <div className="flex items-center justify-between gap-2">
        <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${ROLE_CHIP[role]}`}>
          {ROLE_LABEL[role]}
        </span>
        <StatusDot status={agent.status} />
      </div>

      <div className="mt-3 min-h-[2.5rem]">
        <p
          className="line-clamp-2 text-sm leading-snug text-foreground"
          title={agent.lastAction || ROLE_TAGLINE[role]}
        >
          {agent.lastAction || ROLE_TAGLINE[role]}
        </p>
      </div>

      <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
        <span className={`font-medium ${STATE_TEXT[agent.status]}`}>{STATUS_LABEL[agent.status]}</span>
        <span className="font-mono tabular-nums">
          {elapsed ?? '—'}
          {agent.eventCount > 0 && <span className="ml-2 opacity-70">{agent.eventCount} evt</span>}
        </span>
      </div>
    </div>
  )
}

function StatusDot({ status }: { status: UiAgentStatus }) {
  const color = STATE_VAR[status]

  if (status === 'idle') {
    return <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
  }
  if (status === 'done' || status === 'error') {
    return (
      <span
        className="h-2.5 w-2.5 rounded-full"
        style={{ background: color, boxShadow: `0 0 8px color-mix(in srgb, ${color} 60%, transparent)` }}
      />
    )
  }
  // thinking / running — a pulsing dot with an expanding ring.
  return (
    <span className="relative flex h-2.5 w-2.5">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" style={{ background: color }} />
      <span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ background: color }} />
    </span>
  )
}
