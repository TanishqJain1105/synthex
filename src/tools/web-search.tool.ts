type SearchResult = { url: string; title: string; snippet: string }

// Serper (serper.dev) wraps Google search. Returns the top 5 organic results.
export async function webSearch(query: string, limit = 5): Promise<SearchResult[]> {
  const res = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: {
      'X-API-KEY': process.env.SERPER_API_KEY ?? '',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ q: query, num: limit }),
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
