export type JobStatus = 'pending' | 'running' | 'done' | 'failed'

export type JobPayload = {
  jobId: string
  subtaskId: string
  query: string
  searchStrategy: 'web' | 'academic' | 'news' | 'domain'
  context?: string
}

export type JobResult = {
  jobId: string
  subtaskId: string
  success: boolean
  findingsCount: number
  error?: string
}
