import { BaseAgent } from './base.agent.js'
import { webSearch } from '../tools/web-search.tool.js'
import { arxivSearch } from '../tools/arxiv-search.tool.js'
import { scrapeUrl } from '../tools/scrape-url.tool.js'
import { embedText } from '../tools/embed-chunk.tool.js'
import { scoreSource } from '../tools/score-source.tool.js'
import { scratchpad } from '../memory/scratchpad.js'
import { JobPayload } from '@synthex/shared/types/queue.types'
import { Finding } from '@synthex/shared/types/research.types'

// How many of the top search results each researcher scrapes + embeds.
const MAX_SOURCES = 3

export class ResearcherAgent extends BaseAgent {
  constructor() {
    super('researcher')
  }

  async run(jobId: string, input: JobPayload): Promise<void> {
    const { subtaskId, query, searchStrategy } = input

    this.emit(jobId, { type: 'thinking', payload: { message: `Researching: ${query}`, subtaskId, searchStrategy } })

    // 1. Search — academic strategy hits ArXiv, everything else hits the web.
    // A search failure (offline, Serper down, rate-limited) degrades this subtask
    // to an empty partial rather than throwing: the Orchestrator's re-query loop
    // and the Critic's gap detection handle a subtask that found nothing, but a
    // thrown error would fail the whole BullMQ job and burn its retries.
    let results: Array<{ url: string; title: string; snippet: string }> = []

    try {
      if (searchStrategy === 'academic') {
        this.emit(jobId, { type: 'tool_call', payload: { tool: 'arxiv_search', query } })
        results = await arxivSearch(query)
      } else {
        this.emit(jobId, { type: 'tool_call', payload: { tool: 'web_search', query } })
        results = await webSearch(query)
      }
    } catch (err) {
      this.emit(jobId, { type: 'error', payload: { tool: 'search', error: (err as Error).message } })
      results = []
    }

    this.emit(jobId, { type: 'tool_result', payload: { tool: 'search', count: results.length } })

    // 2. For each top source: scrape, embed into pgvector, record a Finding.
    for (const result of results.slice(0, MAX_SOURCES)) {
      const credibilityScore = (await scoreSource(result.url)).score

      this.emit(jobId, { type: 'tool_call', payload: { tool: 'scrape_url', url: result.url } })
      const content = await scrapeUrl(result.url)

      // Embed the scraped body when available, otherwise fall back to the snippet
      // so the source still lands in the vector store.
      const textToEmbed = content ?? result.snippet
      let chunksEmbedded = 0
      if (textToEmbed) {
        this.emit(jobId, { type: 'tool_call', payload: { tool: 'embed_chunk', length: textToEmbed.length } })
        // A throttled/failed embed must not abort the run — record the source's
        // Finding regardless so the Critic and Synthesizer still see it.
        try {
          chunksEmbedded = await embedText({
            jobId,
            text: textToEmbed,
            sourceUrl: result.url,
            sourceTitle: result.title,
            credibilityScore,
          })
          this.emit(jobId, { type: 'tool_result', payload: { tool: 'embed_chunk', chunksEmbedded } })
        } catch (err) {
          this.emit(jobId, { type: 'error', payload: { tool: 'embed_chunk', error: (err as Error).message } })
        }
      }

      const finding: Finding = {
        jobId,
        subtaskId,
        content: result.snippet,
        sourceUrl: result.url,
        sourceTitle: result.title,
        credibilityScore,
        timestamp: Date.now(),
      }

      await scratchpad.addFinding(jobId, finding)
      this.emit(jobId, { type: 'finding', payload: { finding, chunksEmbedded } })
    }
  }
}
