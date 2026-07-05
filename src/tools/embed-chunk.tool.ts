import pool from '../db/client.js'

// ~4 chars per token is a good enough approximation for English prose without
// pulling in a tokenizer. 500-token chunks with 50-token overlap.
const CHARS_PER_TOKEN = 4
const CHUNK_TOKENS = 500
const OVERLAP_TOKENS = 50
const CHUNK_SIZE = CHUNK_TOKENS * CHARS_PER_TOKEN // 2000 chars
const OVERLAP_SIZE = OVERLAP_TOKENS * CHARS_PER_TOKEN // 200 chars

// Default cap on chunks embedded per source. Bounds cost and keeps a single
// batched request well under Voyage's free-tier token-per-minute limit.
const DEFAULT_MAX_CHUNKS = 6

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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Groq has no embeddings API, so embeddings stay on Voyage AI (voyage-large-2,
// 1536-dim) — what the schema's vector(1536) column expects.
// Batches all texts in one request (correct API usage — the endpoint takes an
// array) and retries with exponential backoff on 429/5xx so free-tier rate
// limits slow the pipeline instead of aborting it.
async function getEmbeddings(texts: string[], attempt = 0): Promise<number[][]> {
  // A hard timeout is essential: a stalled Voyage connection (common under
  // concurrent load / rate limiting) would otherwise hang the researcher's job
  // forever. On timeout the AbortError propagates and is caught by the caller.
  const res = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: 'voyage-large-2', input: texts }),
    signal: AbortSignal.timeout(30_000),
  })

  if (res.status === 429 || res.status >= 500) {
    if (attempt >= 4) throw new Error(`Voyage API error: ${res.status} (retries exhausted)`)
    const backoff = 5_000 * 2 ** attempt // 5s, 10s, 20s, 40s
    await sleep(backoff)
    return getEmbeddings(texts, attempt + 1)
  }

  if (!res.ok) throw new Error(`Voyage API error: ${res.status} ${await res.text()}`)

  const data = await res.json() as { data: Array<{ embedding: number[]; index: number }> }
  // Voyage returns items with an `index` field; sort so embeddings line up with inputs.
  return data.data.sort((a, b) => a.index - b.index).map((d) => d.embedding)
}

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
