import pool from '../db/client.js'

export const vectorStore = {
  async insert(jobId: string, content: string, embedding: number[], sourceUrl: string, sourceTitle: string, credibilityScore: number): Promise<void> {
    await pool.query(
      `INSERT INTO research_chunks (job_id, content, embedding, source_url, source_title, credibility_score)
       VALUES ($1, $2, $3::vector, $4, $5, $6)`,
      [jobId, content, JSON.stringify(embedding), sourceUrl, sourceTitle, credibilityScore]
    )
  },

  async similaritySearch(jobId: string, queryEmbedding: number[], limit = 10) {
    const { rows } = await pool.query(
      `SELECT content, source_url, source_title, credibility_score,
              1 - (embedding <=> $2::vector) AS similarity
       FROM research_chunks
       WHERE job_id = $1
       ORDER BY embedding <=> $2::vector
       LIMIT $3`,
      [jobId, JSON.stringify(queryEmbedding), limit]
    )
    return rows
  },
}
