import { useEffect } from 'react'
import { useResearchStore } from '../stores/research.store'
import { AgentEvent } from '@synthex/shared/types/agent.types'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

// Opens an EventSource to GET /api/stream/:jobId and funnels every agent event
// into the store, which categorises it into per-agent buckets. The connection
// closes itself when the orchestrator emits `done` (or on error/unmount).
export function useAgentStream(jobId: string | null) {
  const addEvent = useResearchStore((s) => s.addEvent)
  const setLoading = useResearchStore((s) => s.setLoading)
  const setError = useResearchStore((s) => s.setError)

  useEffect(() => {
    if (!jobId) return

    const es = new EventSource(`${API}/api/stream/${jobId}`)

    es.onmessage = (e) => {
      let event: AgentEvent
      try {
        event = JSON.parse(e.data) as AgentEvent
      } catch {
        return // ignore malformed frames (e.g. keep-alive comments)
      }

      addEvent(event)

      if (event.type === 'done') {
        setLoading(false)
        es.close()
      } else if (event.type === 'error' && event.payload.fatal) {
        // A fatal error is terminal — the run has stopped, so stop waiting.
        setError(String(event.payload.error ?? 'Research failed'))
        setLoading(false)
        es.close()
      }
      // Non-fatal per-tool errors are surfaced in the activity feed but don't
      // stop the stream — the run continues with a partial result.
    }

    // EventSource fires onerror both on transient reconnects and when the
    // server closes the stream after the job finishes. Only treat it as a
    // hard stop if the connection is actually closed.
    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) {
        setLoading(false)
      }
    }

    return () => es.close()
  }, [jobId, addEvent, setLoading, setError])
}
