import pool from '../db/client.js'

export type Chunk = {
  content: string
  sourceUrl: string
  sourceTitle: string
  credibilityScore: number
  similarity: number // cosine similarity to the query (1 = identical)
}

async function getQueryEmbedding(query: string): Promise<number[]> {
  const res = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: 'voyage-large-2', input: [query] }),
  })
  if (!res.ok) throw new Error(`Voyage API error: ${res.status} ${await res.text()}`)
  const data = await res.json() as { data: Array<{ embedding: number[] }> }
  return data.data[0].embedding
}

export async function ragRetrieve(jobId: string, query: string, limit = 10): Promise<Chunk[]> {
  const embedding = await getQueryEmbedding(query)

  // `<=>` is pgvector's cosine-distance operator (ivfflat vector_cosine_ops index);
  // ordering ascending returns the most semantically similar chunks first.
  const { rows } = await pool.query<{
    content: string
    source_url: string
    source_title: string
    credibility_score: number
    similarity: number
  }>(
    `SELECT content, source_url, source_title, credibility_score,
            1 - (embedding <=> $2::vector) AS similarity
     FROM research_chunks
     WHERE job_id = $1
     ORDER BY embedding <=> $2::vector
     LIMIT $3`,
    [jobId, JSON.stringify(embedding), limit]
  )

  return rows.map((r) => ({
    content: r.content,
    sourceUrl: r.source_url,
    sourceTitle: r.source_title,
    credibilityScore: r.credibility_score,
    similarity: Number(r.similarity),
  }))
}
