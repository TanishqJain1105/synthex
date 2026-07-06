import pool from '../db/client.js'
import { voyageEmbed } from './voyage.js'

// ~4 chars per token is a good enough approximation for English prose without
// pulling in a tokenizer. 500-token chunks with 50-token overlap.
const CHARS_PER_TOKEN = 4
const CHUNK_TOKENS = 500
const OVERLAP_TOKENS = 50
const CHUNK_SIZE = CHUNK_TOKENS * CHARS_PER_TOKEN // 2000 chars
const OVERLAP_SIZE = OVERLAP_TOKENS * CHARS_PER_TOKEN // 200 chars

// Default cap on chunks embedded per source. Each source is one batched Voyage
// request regardless of chunk count, so this bounds per-request token size (kept
// well under the free-tier TPM limit) rather than the request count.
const DEFAULT_MAX_CHUNKS = 3

type EmbedTextInput = {
  jobId: string
  text: string
  sourceUrl: string
  sourceTitle: string
  credibilityScore?: number
  maxChunks?: number
}

type ChunkInput = {
  jobId: string
  content: string
  sourceUrl: string
  sourceTitle: string
  credibilityScore?: number
}

// Groq has no embeddings API, so embeddings stay on Voyage AI (voyage-large-2,
// 1536-dim) — what the schema's vector(1536) column expects. All requests go
// through the shared, globally rate-limited voyageEmbed() so the parallel
// researchers don't burst past the free tier and get 429-throttled. See
// ./voyage.ts for the rationale.
const getEmbeddings = voyageEmbed

// Split a block of text into ~500-token chunks with 50-token overlap so context
// isn't lost at chunk boundaries during retrieval.
export function chunkText(text: string): string[] {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= CHUNK_SIZE) return clean.length > 0 ? [clean] : []

  const chunks: string[] = []
  const stride = CHUNK_SIZE - OVERLAP_SIZE
  for (let start = 0; start < clean.length; start += stride) {
    chunks.push(clean.slice(start, start + CHUNK_SIZE))
    if (start + CHUNK_SIZE >= clean.length) break
  }
  return chunks
}

// Embed a single pre-formed chunk and insert it into pgvector.
export async function embedChunk(input: ChunkInput): Promise<void> {
  const { jobId, content, sourceUrl, sourceTitle, credibilityScore = 0.5 } = input
  const [embedding] = await getEmbeddings([content])

  await pool.query(
    `INSERT INTO research_chunks (job_id, content, embedding, source_url, source_title, credibility_score)
     VALUES ($1, $2, $3::vector, $4, $5, $6)`,
    [jobId, content, JSON.stringify(embedding), sourceUrl, sourceTitle, credibilityScore]
  )
}

// The RAG pipeline entry point: take a full block of scraped text, chunk it with
// overlap, embed every chunk in a single batched request, and insert each into
// pgvector tagged with job_id. Returns the number of chunks embedded.
export async function embedText(input: EmbedTextInput): Promise<number> {
  const { jobId, text, sourceUrl, sourceTitle, credibilityScore = 0.5, maxChunks = DEFAULT_MAX_CHUNKS } = input
  const chunks = chunkText(text).slice(0, maxChunks)
  if (chunks.length === 0) return 0

  const embeddings = await getEmbeddings(chunks)

  // Insert all chunks in one multi-row statement.
  const values: unknown[] = []
  const rows = chunks.map((content, i) => {
    const base = i * 6
    values.push(jobId, content, JSON.stringify(embeddings[i]), sourceUrl, sourceTitle, credibilityScore)
    return `($${base + 1}, $${base + 2}, $${base + 3}::vector, $${base + 4}, $${base + 5}, $${base + 6})`
  })

  await pool.query(
    `INSERT INTO research_chunks (job_id, content, embedding, source_url, source_title, credibility_score)
     VALUES ${rows.join(', ')}`,
    values
  )

  return chunks.length
}
