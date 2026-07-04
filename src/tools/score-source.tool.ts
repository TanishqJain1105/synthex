// Objective source credibility so the Critic scores on evidence, not vibes.
export type CredibilityScore = {
  url: string
  domainAuthority: number // 0-1, from domain reputation
  publicationDate: string | null // best-effort, extracted from the URL
  ageYears: number | null // years since publicationDate
  corroborationCount: number // # of independent (different-domain) peer sources
  score: number // overall blended 0-1
}

const HIGH_CREDIBILITY_DOMAINS = [
  'arxiv.org', 'nature.com', 'science.org', 'pubmed.ncbi.nlm.nih.gov',
  'scholar.google.com', 'jstor.org', 'ieee.org', 'acm.org',
  'bbc.com', 'reuters.com', 'apnews.com', 'nytimes.com',
]

const LOW_CREDIBILITY_DOMAINS = ['reddit.com', 'quora.com', 'yahoo.answers.com', 'medium.com']

const RECENCY_PENALTY_YEARS = 2 // fast-moving topics: penalize sources older than this

function domainOf(url: string): string {
  return new URL(url).hostname.replace(/^www\./, '')
}

function authorityOf(hostname: string): number {
  if (HIGH_CREDIBILITY_DOMAINS.some((d) => hostname.endsWith(d))) return 0.9
  if (LOW_CREDIBILITY_DOMAINS.some((d) => hostname.endsWith(d))) return 0.3
  return 0.5
}

// Best-effort publication-date estimate from the URL path (e.g. /2024/03/15/,
// /2024-03-…, …-2023/). Returns an ISO-ish string or null.
function extractDate(url: string): string | null {
  const full = url.match(/(20[0-2]\d)[/\-](0[1-9]|1[0-2])[/\-](0[1-9]|[12]\d|3[01])/)
  if (full) return `${full[1]}-${full[2]}-${full[3]}`
  const year = url.match(/[/\-_?=](20[0-2]\d)(?:[/\-_]|$)/)
  if (year) return `${year[1]}-01-01`
  return null
}

// Scores a single source. `peerUrls` are the other findings in the set — used to
// compute corroboration (how many independent domains also covered this topic).
export async function scoreSource(url: string, peerUrls: string[] = []): Promise<CredibilityScore> {
  let hostname: string
  try {
    hostname = domainOf(url)
  } catch {
    return { url, domainAuthority: 0.3, publicationDate: null, ageYears: null, corroborationCount: 0, score: 0.3 }
  }

  const domainAuthority = authorityOf(hostname)

  const publicationDate = extractDate(url)
  const ageYears = publicationDate
    ? (Date.now() - new Date(publicationDate).getTime()) / (365.25 * 24 * 3600 * 1000)
    : null

  // Independent corroboration = distinct peer domains different from this one.
  const peerDomains = new Set<string>()
  for (const p of peerUrls) {
    try {
      const d = domainOf(p)
      if (d !== hostname) peerDomains.add(d)
    } catch {
      // ignore malformed peer URLs
    }
  }
  const corroborationCount = peerDomains.size

  // Blend: authority baseline, recency penalty for stale sources, corroboration bonus.
  let score = domainAuthority
  if (ageYears !== null && ageYears > RECENCY_PENALTY_YEARS) score -= 0.15
  score += Math.min(corroborationCount * 0.05, 0.15)
  score = Math.max(0.05, Math.min(1, score))

  return { url, domainAuthority, publicationDate, ageYears, corroborationCount, score }
}
