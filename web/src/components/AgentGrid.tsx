import { ROLES } from '../lib/agents'
import { AgentCard } from './AgentCard'

// The five agents at a glance — the "control room" row. Researcher runs as N
// parallel instances on the backend; the card reflects the most recent of them.
export function AgentGrid() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {ROLES.map((role) => (
        <AgentCard key={role} role={role} />
      ))}
    </div>
  )
}
