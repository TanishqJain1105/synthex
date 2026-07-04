import { useResearchStore } from '../stores/research.store'
import { Report } from '@synthex/shared/types/research.types'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

// The reports table is snake_case; normalise it to the camelCase `Report` type
// the viewer expects. Without this, `confidenceScore`/`knowledgeGaps` come back
// undefined for historical reports.
function normalizeReport(row: Record<string, unknown>): Report {
  return {
    id: String(row.id ?? ''),
    jobId: String(row.job_id ?? ''),
    content: String(row.content ?? ''),
    citations: (row.citations as Report['citations']) ?? [],
    knowledgeGaps: (row.knowledge_gaps as string[]) ?? [],
    confidenceScore: Number(row.confidence_score ?? 0),
    createdAt: String(row.created_at ?? ''),
  }
}

export function useResearch() {
  const store = useResearchStore()

  // Starts a new job. Returns the jobId so the caller can navigate to the
  // report route, where the SSE stream is connected.
  async function submit(query: string): Promise<string | null> {
    store.reset()
    store.setQuery(query)
    store.setLoading(true)

    try {
      const res = await fetch(`${API}/api/research`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      })
      if (!res.ok) throw new Error(`Server error: ${res.status}`)

      const { jobId } = (await res.json()) as { jobId: string }
      store.setJobId(jobId)
      return jobId
    } catch (err) {
      store.setError((err as Error).message)
      store.setLoading(false)
      return null
    }
  }

  async function fetchHistory() {
    try {
      const res = await fetch(`${API}/api/history`)
      if (!res.ok) return
      store.setHistory(await res.json())
    } catch {
      /* history is non-critical — fail quietly */
    }
  }

  // Loads a persisted report for a completed job. Returns false when none
  // exists yet (e.g. a job that is still streaming), so the caller can decide
  // whether to fall back to the live stream.
  async function fetchReport(jobId: string): Promise<boolean> {
    try {
      const res = await fetch(`${API}/api/history/${jobId}/report`)
      if (!res.ok) return false
      store.setReport(normalizeReport(await res.json()))
      return true
    } catch {
      return false
    }
  }

  return { submit, fetchHistory, fetchReport }
}
