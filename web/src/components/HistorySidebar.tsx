import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useResearch } from '../hooks/useResearch'
import { useResearchStore } from '../stores/research.store'

function scoreVar(score: number | null): string {
  if (score == null) return 'var(--muted-foreground)'
  if (score >= 0.75) return 'var(--conf-high)'
  if (score >= 0.5) return 'var(--conf-med)'
  return 'var(--conf-low)'
}

const STATUS_TEXT: Record<string, string> = {
  done: 'text-agent-done',
  failed: 'text-destructive',
}

export function HistorySidebar() {
  const { fetchHistory } = useResearch()
  const history = useResearchStore((s) => s.history)
  const navigate = useNavigate()

  useEffect(() => {
    fetchHistory()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <aside className="flex h-full w-full flex-col overflow-hidden">
      <h2 className="mb-3 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">History</h2>

      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
        {history.length === 0 && <p className="px-1 text-sm text-muted-foreground opacity-70">No past research yet.</p>}

        {history.map((item) => (
          <button
            key={item.id}
            onClick={() => navigate(`/report/${item.id}`)}
            className="group w-full rounded-lg border border-transparent p-2.5 text-left transition hover:border-border hover:bg-muted"
          >
            <p className="line-clamp-2 text-sm font-medium text-foreground transition group-hover:text-primary">
              {item.query}
            </p>
            <div className="mt-1 flex items-center justify-between text-xs">
              <span className={STATUS_TEXT[item.status] ?? 'text-chart-4'}>{item.status}</span>
              {item.confidence_score != null && (
                <span className="font-mono font-semibold tabular-nums" style={{ color: scoreVar(item.confidence_score) }}>
                  {Math.round(item.confidence_score * 100)}%
                </span>
              )}
            </div>
          </button>
        ))}
      </div>
    </aside>
  )
}
