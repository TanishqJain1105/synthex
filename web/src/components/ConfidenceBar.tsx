type Props = {
  score: number
  /** The Critic's acceptance threshold — drawn as a tick so the score reads in context. */
  threshold?: number
  approved?: boolean
}

// Map a score onto the confidence colour tokens: >0.75 high, 0.5–0.75 med, else low.
function confVar(score: number): string {
  if (score >= 0.75) return 'var(--conf-high)'
  if (score >= 0.5) return 'var(--conf-med)'
  return 'var(--conf-low)'
}

export function ConfidenceBar({ score, threshold = 0.7, approved }: Props) {
  const clamped = Math.max(0, Math.min(1, score))
  const pct = Math.round(clamped * 100)
  const color = confVar(clamped)
  const verdict = approved ?? score >= threshold

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-muted-foreground">Research confidence</span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold" style={{ color }}>
          {verdict ? 'Verified' : 'Tentative'}
        </span>
      </div>

      <div className="relative h-2.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full transition-[width] duration-700 ease-out"
          style={{ width: `${pct}%`, background: color }}
        />
        {/* threshold tick */}
        <span
          className="absolute top-0 h-full w-px"
          style={{ left: `${Math.round(threshold * 100)}%`, background: 'var(--muted-foreground)' }}
          title={`Acceptance threshold ${Math.round(threshold * 100)}%`}
        />
      </div>

      <div className="flex justify-between text-[11px] tabular-nums text-muted-foreground">
        <span>0%</span>
        <span className="font-semibold" style={{ color }}>
          {pct}%
        </span>
        <span>100%</span>
      </div>
    </div>
  )
}
