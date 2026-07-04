import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useResearch } from '../hooks/useResearch'
import { useResearchStore } from '../stores/research.store'

const EXAMPLES = [
  'What are the most promising approaches to grid-scale energy storage in 2026?',
  'How does semaglutide compare to tirzepatide for long-term weight loss?',
  'What caused the 2023 regional banking crisis, and what changed since?',
  'Is there scientific consensus on the health effects of intermittent fasting?',
]

export function QueryInput() {
  const [value, setValue] = useState('')
  const { submit } = useResearch()
  const isLoading = useResearchStore((s) => s.isLoading)
  const navigate = useNavigate()

  async function run(query: string) {
    if (!query.trim() || isLoading) return
    const jobId = await submit(query.trim())
    if (jobId) navigate(`/report/${jobId}`)
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    run(value)
  }

  return (
    <div className="w-full max-w-2xl">
      <form onSubmit={handleSubmit} className="relative">
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              run(value)
            }
          }}
          placeholder="Ask anything worth researching…"
          rows={3}
          disabled={isLoading}
          autoFocus
          className="w-full resize-none rounded-lg border border-border bg-card px-5 py-4 text-lg text-foreground shadow-sm outline-none transition placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={isLoading || !value.trim()}
          className="absolute bottom-3 right-3 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isLoading ? 'Dispatching…' : 'Research →'}
        </button>
      </form>

      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            disabled={isLoading}
            onClick={() => {
              setValue(ex)
              run(ex)
            }}
            className="max-w-full truncate rounded-full border border-border bg-card px-3.5 py-1.5 text-xs text-muted-foreground transition hover:border-ring hover:text-foreground disabled:opacity-50"
            title={ex}
          >
            {ex}
          </button>
        ))}
      </div>
    </div>
  )
}
