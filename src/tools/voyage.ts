// Shared Voyage AI embeddings client — serialized, BOUNDED, and best-effort.
//
// Hard reality (measured, not assumed): the Voyage free tier is a ~3 request/
// minute bucket. Once it's spent, every call returns 429 until it refills. Our
// pipeline issues far more embed requests than that (N researchers × M sources ×
// re-query rounds), so most calls WILL be throttled and there is no rate-limit
// setting that makes them all succeed quickly.
//
// Therefore embeddings are treated as BEST-EFFORT enrichment, never a hard
// dependency:
//   * All calls are serialized (concurrency 1) through one global queue so the
//     parallel researchers never fire simultaneous bursts.
//   * They are spaced VOYAGE_MIN_INTERVAL_MS apart (small — just enough to avoid
//     bursts, NOT enough to guarantee success).
//   * On 429/5xx we retry at most VOYAGE_MAX_RETRIES times with SHORT, bounded
//     backoff, then give up FAST by throwing. A previous version backed off
//     5→10→20→40s per call, which wedged the whole serialized queue and let a
//     runaway backlog of researcher jobs hammer Voyage forever — the root cause
//     of jobs getting stuck at "running" with an empty vector store.
//
// Callers must tolerate a thrown error: the researcher records its Finding from
// the search snippet regardless, and the synthesizer's RAG step falls back to
// the raw scratchpad findings. A job therefore always completes and always
// produces a cited report; embeddings simply improve retrieval WHEN the free-tier
// budget allows. If you have a paid Voyage key, raise VOYAGE_MIN_INTERVAL_MS and
// VOYAGE_MAX_RETRIES so more chunks land in pgvector.

const MIN_INTERVAL_MS = parseInt(process.env.VOYAGE_MIN_INTERVAL_MS ?? '1500')
const MAX_RETRIES = parseInt(process.env.VOYAGE_MAX_RETRIES ?? '2')
const MODEL = process.env.VOYAGE_MODEL ?? 'voyage-large-2'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Serialize all Voyage calls: each task waits for the previous one AND for
// MIN_INTERVAL_MS since the last request started. Because every task now settles
// in BOUNDED time (see fast-fail below), the chain always advances — one failed
// embed can never wedge the queue for later requests.
let chain: Promise<unknown> = Promise.resolve()
let lastStart = 0

function schedule<T>(task: () => Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const wait = Math.max(0, lastStart + MIN_INTERVAL_MS - Date.now())
    if (wait > 0) await sleep(wait)
    lastStart = Date.now()
    return task()
  })
  chain = run.then(() => undefined, () => undefined)
  return run
}

// One raw embedding request with SHORT, bounded backoff on 429/5xx. Worst case
// per call ≈ 2s + 4s of backoff then throw (or a 20s network timeout) — never the
// multi-minute stalls that caused the backlog. A hard timeout is essential so a
// stalled connection can't hang the serialized queue.
async function embedRequest(texts: string[], attempt = 0): Promise<number[][]> {
  const res = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: MODEL, input: texts }),
    signal: AbortSignal.timeout(20_000),
  })

  if (res.status === 429 || res.status >= 500) {
    if (attempt >= MAX_RETRIES) {
      // Give up fast — the caller records the finding without an embedding.
      throw new Error(`Voyage API error: ${res.status} (rate-limited; skipping embed)`)
    }
    await sleep(2_000 * (attempt + 1)) // 2s, 4s — short and bounded
    return embedRequest(texts, attempt + 1)
  }

  if (!res.ok) throw new Error(`Voyage API error: ${res.status} ${await res.text()}`)

  const data = (await res.json()) as { data: Array<{ embedding: number[]; index: number }> }
  // Voyage returns items with an `index` field; sort so embeddings line up with inputs.
  return data.data.sort((a, b) => a.index - b.index).map((d) => d.embedding)
}

// Embed a batch of texts in one request, serialized through the global queue.
export function voyageEmbed(texts: string[]): Promise<number[][]> {
  return schedule(() => embedRequest(texts))
}

// Convenience for the single-query case (RAG retrieval).
export async function voyageEmbedOne(text: string): Promise<number[]> {
  const [embedding] = await voyageEmbed([text])
  return embedding
}
