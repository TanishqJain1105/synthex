import pool from '../db/client.js'
import { voyageEmbedOne } from './voyage.js'

export type Chunk = {
  content: string
  sourceUrl: string
  sourceTitle: string
  credibilityScore: number
  similarity: number // cosine similarity to the query (1 = identical)
}

export async function ragRetrieve(jobId: string, query: string, limit = 10): Promise<Chunk[]> {
  // The query embedding must be the SAME model/dimension as the stored chunks,
  // and it goes through the same shared, rate-limited Voyage queue so it never
  // competes with the researchers' embedding calls for the free-tier budget.
  const embedding = await voyageEmbedOne(query)

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
