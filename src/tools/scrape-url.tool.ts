import * as cheerio from 'cheerio'

// Below this many characters of extracted text, we treat the page as JS-heavy
// (content rendered client-side) and retry with a headless browser.
const JS_HEAVY_THRESHOLD = 500

// Fetch a URL and return clean article text. Fast path uses Cheerio on the raw
// HTML; if that yields too little text (a client-rendered page), fall back to
// Playwright to execute JS and render the DOM. Phase 3 requires this fallback.
export async function scrapeUrl(url: string): Promise<string | null> {
  const cheerioText = await scrapeWithCheerio(url)

  if (cheerioText && cheerioText.length >= JS_HEAVY_THRESHOLD) {
    return cheerioText
  }

  // JS-heavy or empty: try a headless browser. Returns cheerioText if Playwright
  // is unavailable so we never regress below the fast path.
  const rendered = await scrapeWithPlaywright(url)
  return rendered ?? cheerioText
}

async function scrapeWithCheerio(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Synthex-Research-Bot/1.0' },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return null

    const html = await res.text()
    return extractText(html)
  } catch {
    return null
  }
}

async function scrapeWithPlaywright(url: string): Promise<string | null> {
  let chromium: typeof import('playwright').chromium
  try {
    ;({ chromium } = await import('playwright'))
  } catch {
    // Playwright not installed — the Cheerio result stands.
    return null
  }

  let browser: import('playwright').Browser | undefined
  try {
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage({ userAgent: 'Synthex-Research-Bot/1.0' })
    await page.goto(url, { waitUntil: 'networkidle', timeout: 20_000 })
    const html = await page.content()
    return extractText(html)
  } catch {
    return null
  } finally {
    await browser?.close()
  }
}

// Strip chrome (nav/footer/scripts/ads) and collapse whitespace. Capped at 50K
// chars so a single huge page can't blow up downstream chunking/embedding.
function extractText(html: string): string {
  const $ = cheerio.load(html)
  $('script, style, nav, footer, header, aside, noscript, iframe').remove()
  return $('body').text().replace(/\s+/g, ' ').trim().slice(0, 50_000)
}
