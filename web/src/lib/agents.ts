import { AgentRole } from '@synthex/shared/types/agent.types'

// Ordered list — drives the agent grid and the pipeline visual left-to-right.
export const ROLES: AgentRole[] = ['orchestrator', 'planner', 'researcher', 'critic', 'synthesizer']

export const ROLE_LABEL: Record<AgentRole, string> = {
  orchestrator: 'Orchestrator',
  planner: 'Planner',
  researcher: 'Researcher',
  critic: 'Critic',
  synthesizer: 'Synthesizer',
}

// One short line describing what each agent is for — shown when idle.
export const ROLE_TAGLINE: Record<AgentRole, string> = {
  orchestrator: 'Directs the swarm',
  planner: 'Decomposes the question',
  researcher: 'Searches & reads sources',
  critic: 'Verifies & scores',
  synthesizer: 'Writes the report',
}

// The Catppuccin token each agent is themed with. As a `var()` string it can be
// dropped into inline styles (feed rails, glyphs, glows) so it swaps with theme.
export const ROLE_VAR: Record<AgentRole, string> = {
  orchestrator: 'var(--primary)', // mauve
  planner: 'var(--accent)', // sky
  researcher: 'var(--agent-done)', // green
  critic: 'var(--destructive)', // red
  synthesizer: 'var(--chart-4)', // peach
}

// The matching Tailwind text-color utility per agent. Full literal strings so
// the JIT compiler keeps them.
export const ROLE_TEXT: Record<AgentRole, string> = {
  orchestrator: 'text-primary',
  planner: 'text-accent',
  researcher: 'text-agent-done',
  critic: 'text-destructive',
  synthesizer: 'text-chart-4',
}

// Chip styling per agent — a tinted background plus the role's text token.
// Uses baked-alpha bg tokens where they exist, `bg-muted` otherwise.
export const ROLE_CHIP: Record<AgentRole, string> = {
  orchestrator: 'bg-agent-running-bg text-primary',
  planner: 'bg-muted text-accent',
  researcher: 'bg-agent-done-bg text-agent-done',
  critic: 'bg-agent-error-bg text-destructive',
  synthesizer: 'bg-muted text-chart-4',
}
