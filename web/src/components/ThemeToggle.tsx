import { useResearchStore } from '../stores/research.store'

export function ThemeToggle() {
  const theme = useResearchStore((s) => s.theme)
  const toggleTheme = useResearchStore((s) => s.toggleTheme)

  return (
    <button
      onClick={toggleTheme}
      className="flex items-center gap-1.5 rounded border border-sidebar-border px-3 py-1.5 font-mono text-xs text-muted-foreground transition-colors hover:bg-muted"
      aria-label="Toggle theme"
    >
      {theme === 'dark' ? '🌙 Dark' : '☀️ Light'}
    </button>
  )
}
