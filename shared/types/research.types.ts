export type QueryType = 'factual' | 'exploratory' | 'comparative' | 'causal'

export type Query = {
  id: string
  text: string
  type: QueryType
}

export type Citation = {
  n: number
  url: string
  title: string
  credibility: number
}

export type Finding = {
  jobId: string
  subtaskId: string
  content: string
  sourceUrl: string
  sourceTitle: string
  credibilityScore: number
  timestamp: number
}

export type Report = {
  id: string
  jobId: string
  content: string
  citations: Citation[]
  knowledgeGaps: string[]
  confidenceScore: number
  createdAt: string
}

// Output of the Critic's adversarial pass over a job's findings.
export type CriticReport = {
  jobId: string
  round: number
  confidenceScore: number
  approved: boolean
  reasoning: string
  contradictions: string[] // pairs of findings that directly conflict
  singleSourceClaims: string[] // claims backed by only one source
  gaps: string[] // what's missing — feeds the re-query loop
}
