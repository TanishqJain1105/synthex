import { scratchpad } from '../memory/scratchpad.js'
import { Citation } from '@synthex/shared/types/research.types'
import { Chunk } from './rag-retrieve.tool.js'

// Maps the Synthesizer's inline [n] tags to real sources. The report cites [n]
// where n is the 1-based index of a retrieved chunk in the context, so citation
// n → chunks[n-1]'s source. Credibility is enriched from the scratchpad, which
// is the source of truth for per-source scores.
export async function generateCitations(jobId: string, reportText: string, chunks: Chunk[]): Promise<Citation[]> {
  // scratchpad Finding credibility, keyed by URL — overrides the chunk's copy.
  const findings = await scratchpad.getFindings(jobId)
  const credByUrl = new Map<string, number>()
  for (const f of findings) credByUrl.set(f.sourceUrl, f.credibilityScore)

  const citationFor = (index1: number): Citation | null => {
    const chunk = chunks[index1 - 1]
    if (!chunk) return null
    return {
      n: index1,
      url: chunk.sourceUrl,
      title: chunk.sourceTitle,
      credibility: credByUrl.get(chunk.sourceUrl) ?? chunk.credibilityScore,
    }
  }

  // Which [n] tags did the report actually use?
  const used = new Set<number>()
  for (const m of reportText.matchAll(/\[(\d+)\]/g)) {
    const n = parseInt(m[1], 10)
    if (n >= 1 && n <= chunks.length) used.add(n)
  }

  if (used.size > 0) {
    return [...used]
      .sort((a, b) => a - b)
      .map(citationFor)
      .filter((c): c is Citation => c !== null)
  }

  // The model cited nothing — still attach one citation per unique source so the
  // report has a source list rather than an empty citations array.
  const seen = new Set<string>()
  const fallback: Citation[] = []
  chunks.forEach((chunk, i) => {
    if (seen.has(chunk.sourceUrl)) return
    seen.add(chunk.sourceUrl)
    fallback.push({
      n: i + 1,
      url: chunk.sourceUrl,
      title: chunk.sourceTitle,
      credibility: credByUrl.get(chunk.sourceUrl) ?? chunk.credibilityScore,
    })
  })
  return fallback
}
