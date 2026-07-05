type SearchResult = { url: string; title: string; snippet: string }

// Serper (serper.dev) wraps Google search. Returns the top 5 organic results.
export async function webSearch(query: string, limit = 5): Promise<SearchResult[]> {
  // A hard timeout is essential: without it a stalled Serper connection would
  // hang the researcher's job forever (and, in turn, the whole orchestrator).
  const res = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: {
      'X-API-KEY': process.env.SERPER_API_KEY ?? '',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ q: query, num: limit }),
    signal: AbortSignal.timeout(15_000),
  })

  if (!res.ok) throw new Error(`Serper API error: ${res.status}`)

  const data = await res.json() as { organic?: Array<{ link: string; title: string; snippet: string }> }

  return (data.organic ?? [])
    .slice(0, limit)
    .map((r) => ({
      url: r.link,
      title: r.title,
      snippet: r.snippet,
    }))
}
