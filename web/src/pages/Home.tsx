import { QueryInput } from '../components/QueryInput'
import { HistorySidebar } from '../components/HistorySidebar'
import { ThemeToggle } from '../components/ThemeToggle'
import { useResearchStore } from '../stores/research.store'

export function Home() {
  const error = useResearchStore((s) => s.error)

  return (
    <div className="relative mx-auto flex min-h-screen w-full max-w-7xl gap-8 px-4 py-8 lg:px-8">
      {/* Theme toggle, top-right */}
      <div className="absolute right-4 top-6 z-10 lg:right-8">
        <ThemeToggle />
      </div>

      {/* History rail — hidden on small screens */}
      <div className="hidden w-64 shrink-0 lg:block">
        <div className="sticky top-8 h-[calc(100vh-4rem)] rounded-lg border border-sidebar-border bg-sidebar p-4">
          <HistorySidebar />
        </div>
      </div>

      {/* Hero + query */}
      <main className="flex flex-1 flex-col items-center justify-center gap-8 py-16 text-center">
        <div className="space-y-4">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: 'var(--agent-done)' }} />
            Five agents · autonomous deep research
          </span>
          <h1 className="bg-gradient-to-r from-primary to-accent bg-clip-text text-5xl font-bold tracking-tight text-transparent sm:text-6xl">
            Synthex
          </h1>
          <p className="text-lg text-muted-foreground">From noise to knowledge.</p>
        </div>

        <QueryInput />

        {error && <p className="text-sm text-destructive">{error}</p>}

        <p className="max-w-md text-sm text-muted-foreground opacity-80">
          A swarm of specialized agents will plan, search, verify, and synthesize a fully-cited answer — live, in front
          of you.
        </p>
      </main>
    </div>
  )
}
