import { useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useResearch } from '../hooks/useResearch'
import { useResearchStore } from '../stores/research.store'
import { useAgentStream } from '../hooks/useAgentStream'
import { AgentGrid } from '../components/AgentGrid'
import { AgentFeed } from '../components/AgentFeed'
import { ReportViewer } from '../components/ReportViewer'
import { ThemeToggle } from '../components/ThemeToggle'

export function Report() {
  const { jobId } = useParams<{ jobId: string }>()
  const { fetchReport } = useResearch()
  const query = useResearchStore((s) => s.query)
  const isLoading = useResearchStore((s) => s.isLoading)
  const isDone = useResearchStore((s) => s.isDone)
  const report = useResearchStore((s) => s.report)
  const error = useResearchStore((s) => s.error)

  // If we've landed on a job that isn't the one currently in the store (a
  // history click or a page refresh), reset and load any persisted report.
  // A freshly-submitted job is already in the store, so we leave its live
  // state — and its in-flight events — untouched.
  useEffect(() => {
    if (!jobId) return
    if (useResearchStore.getState().jobId !== jobId) {
      useResearchStore.getState().reset()
      useResearchStore.getState().setJobId(jobId)
      fetchReport(jobId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId])

  useAgentStream(jobId ?? null)

  const live = isLoading && !isDone && !report
  const complete = isDone || !!report

  return (
    <div className="mx-auto min-h-screen w-full max-w-7xl px-4 py-8 lg:px-8">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link to="/" className="text-sm font-medium text-primary transition hover:opacity-80">
            ← New research
          </Link>
          <h1 className="mt-2 line-clamp-2 max-w-3xl text-2xl font-semibold tracking-tight text-foreground">
            {query || 'Research report'}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <StatusPill live={live} complete={complete} />
          <ThemeToggle />
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-agent-error bg-agent-error-bg px-4 py-2.5 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Agent control room */}
      <div className="mb-6">
        <AgentGrid />
      </div>

      {/* Live feed + report, side by side on large screens */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <div className="h-[70vh] lg:sticky lg:top-8 lg:h-[calc(100vh-6rem)]">
          <AgentFeed />
        </div>
        <div>
          <ReportViewer />
        </div>
      </div>
    </div>
  )
}

function StatusPill({ live, complete }: { live: boolean; complete: boolean }) {
  if (complete) {
    return (
      <span className="inline-flex shrink-0 items-center gap-2 rounded-full bg-agent-done-bg px-3 py-1.5 text-xs font-semibold text-agent-done">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--agent-done)' }} />
        Complete
      </span>
    )
  }
  if (live) {
    return (
      <span className="inline-flex shrink-0 items-center gap-2 rounded-full bg-agent-running-bg px-3 py-1.5 text-xs font-semibold text-agent-running">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: 'var(--agent-running)' }} />
        Agents working…
      </span>
    )
  }
  return (
    <span className="inline-flex shrink-0 items-center gap-2 rounded-full bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground">
      Idle
    </span>
  )
}
