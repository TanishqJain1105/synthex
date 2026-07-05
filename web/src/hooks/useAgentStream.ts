import { useEffect } from 'react'
import { useResearchStore } from '../stores/research.store'
import { AgentEvent } from '@synthex/shared/types/agent.types'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

// How long the client waits with no SSE events before declaring the job stalled.
// If the backend dies mid-query its in-memory job state is gone, so EventSource
// reconnects to a stream that will never emit again — without this watchdog the
// UI would sit on "working" forever.
const STALL_TIMEOUT_MS = Number(import.meta.env.VITE_SSE_STALL_TIMEOUT_MS) || 30_000

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

    // Stall watchdog: if no event arrives within STALL_TIMEOUT_MS, treat the job
    // as stalled, close the stream, and surface an error so the user can resubmit.
    // Any incoming event (below) resets the timer.
    let stallTimer: ReturnType<typeof setTimeout>
    const armStallTimer = () => {
      clearTimeout(stallTimer)
      stallTimer = setTimeout(() => {
        setError('Research stalled — no activity from the server. Please resubmit your query.')
        setLoading(false)
        es.close()
      }, STALL_TIMEOUT_MS)
    }
    armStallTimer()

    es.onmessage = (e) => {
      armStallTimer() // fresh activity — the job is alive, restart the watchdog

      let event: AgentEvent
      try {
        event = JSON.parse(e.data) as AgentEvent
      } catch {
        return // ignore malformed frames (e.g. keep-alive comments)
      }

      addEvent(event)

      if (event.type === 'done') {
        clearTimeout(stallTimer)
        setLoading(false)
        es.close()
      } else if (event.type === 'error' && event.payload.fatal) {
        // A fatal error is terminal — the run has stopped, so stop waiting.
        clearTimeout(stallTimer)
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
        clearTimeout(stallTimer)
        setLoading(false)
      }
    }

    return () => {
      clearTimeout(stallTimer)
      es.close()
    }
  }, [jobId, addEvent, setLoading, setError])
}
