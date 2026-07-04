import { BaseAgent } from './base.agent.js'
import { ragRetrieve } from '../tools/rag-retrieve.tool.js'
import { generateCitations } from '../tools/generate-citations.tool.js'
import { scratchpad } from '../memory/scratchpad.js'
import { synthesizerPrompt } from '../prompts/synthesizer.prompt.js'
import pool from '../db/client.js'

const CONFIDENCE_THRESHOLD = parseFloat(process.env.CRITIC_CONFIDENCE_THRESHOLD ?? '0.7')

export class SynthesizerAgent extends BaseAgent {
  constructor() {
    super('synthesizer')
  }

  async run(jobId: string, input: { query: string }): Promise<void> {
    const { query } = input

    // 1. RAG retrieval — the Synthesizer only sees the most relevant chunks.
    this.emit(jobId, { type: 'thinking', payload: { message: 'Retrieving relevant chunks via RAG…' } })
    const chunks = await ragRetrieve(jobId, query, 10)
    this.emit(jobId, { type: 'tool_result', payload: { tool: 'rag_retrieve', chunksRetrieved: chunks.length } })

    // 2. Pull the Critic's verdict so the report's confidence + gaps are real,
    // not invented by the writer.
    const criticReport = await scratchpad.getCriticReport(jobId)
    const confidence = criticReport?.confidenceScore ?? (chunks.length > 0 ? 0.6 : 0)
    const criticGaps = criticReport?.gaps ?? []

    const context = chunks
      .map((c, i) => `[${i + 1}] (${c.sourceTitle} — ${c.sourceUrl})\n${c.content}`)
      .join('\n\n')

    // 3. Stream the report token-by-token to the SSE bus.
    this.emit(jobId, { type: 'thinking', payload: { message: 'Generating report…' } })

    const gapsBlock = criticGaps.length > 0
      ? `\n\nThe Critic flagged these outstanding gaps — fold them into the Knowledge Gaps section:\n${criticGaps.map((g) => `- ${g}`).join('\n')}`
      : ''

    const stream = await this.client.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: synthesizerPrompt,
      messages: [{
        role: 'user',
        content: `Research question: ${query}\n\nConfidence score to report: ${confidence.toFixed(2)}${gapsBlock}\n\nVerified findings (cite by their [n] tag):\n${context}`,
      }],
    })

    let reportContent = ''
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        const chunk = event.delta.text
        reportContent += chunk
        // Each token streams live to whoever is listening on /api/stream/:jobId.
        this.emit(jobId, { type: 'report_chunk', payload: { chunk } })
      }
    }

    // 4. Map the report's [n] tags back to real sources.
    const citations = await generateCitations(jobId, reportContent, chunks)

    // 5. Persist with the real confidence, citations, and gaps; signal completion.
    await pool.query(
      `INSERT INTO reports (job_id, content, citations, knowledge_gaps, confidence_score)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (job_id) DO UPDATE
       SET content = $2, citations = $3, knowledge_gaps = $4, confidence_score = $5`,
      [jobId, reportContent, JSON.stringify(citations), criticGaps, confidence]
    )

    this.emit(jobId, {
      type: 'report_chunk',
      payload: { done: true, citations, confidence, knowledgeGaps: criticGaps, approved: confidence >= CONFIDENCE_THRESHOLD },
    })
  }
}
