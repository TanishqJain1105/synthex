// ArXiv Atom feed parser. Returns papers with title, full abstract, an
// abstract-page URL (scrapeable), and the direct PDF link.
type ArxivResult = {
  url: string // abstract page (e.g. http://arxiv.org/abs/2301.01234) — scrapeable
  title: string
  snippet: string // full abstract text
  pdfUrl: string // direct PDF link
}

export async function arxivSearch(query: string, maxResults = 3): Promise<ArxivResult[]> {
  const params = new URLSearchParams({
    search_query: `all:${query}`,
    start: '0',
    max_results: String(maxResults),
    sortBy: 'relevance',
    sortOrder: 'descending',
  })

  const res = await fetch(`https://export.arxiv.org/api/query?${params}`, {
    headers: { 'User-Agent': 'Synthex-Research-Bot/1.0' },
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new Error(`ArXiv API error: ${res.status}`)

  const xml = await res.text()
  const entries = xml.match(/<entry>([\s\S]*?)<\/entry>/g) ?? []

  return entries.slice(0, maxResults).map((entry) => {
    const title = clean((entry.match(/<title>([\s\S]*?)<\/title>/) ?? [])[1] ?? 'Untitled')
    const summary = clean((entry.match(/<summary>([\s\S]*?)<\/summary>/) ?? [])[1] ?? '')
    const absUrl = ((entry.match(/<id>([\s\S]*?)<\/id>/) ?? [])[1] ?? '').trim()

    // ArXiv provides an explicit PDF <link>; fall back to deriving it from the abs URL.
    const pdfMatch = entry.match(/<link[^>]*title="pdf"[^>]*href="([^"]+)"/)
    const pdfUrl = pdfMatch?.[1] ?? absUrl.replace('/abs/', '/pdf/')

    return { url: absUrl, title, snippet: summary, pdfUrl }
  })
}

function clean(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}
