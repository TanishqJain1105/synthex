import type { CSSProperties } from 'react'
import { useResearchStore } from '../stores/research.store'
import { Citation } from '@synthex/shared/types/research.types'
import { ConfidenceBar } from './ConfidenceBar'
import { CitationBadge } from './CitationBadge'

export function ReportViewer() {
  const { report, reportContent, citations, knowledgeGaps, confidenceScore, approved, isLoading, isDone } =
    useResearchStore()

  // Prefer a persisted (historical) report; fall back to the live stream.
  const content = report?.content ?? reportContent
  const cites = report?.citations ?? citations
  const gaps = report?.knowledgeGaps ?? knowledgeGaps
  const confidence = report?.confidenceScore ?? confidenceScore
  const streaming = isLoading && !isDone && !report

  if (!content) {
    if (!streaming) return null
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        The Synthesizer will write the report here once the Critic approves the findings…
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <article className="rounded-lg border border-border bg-card p-6 shadow-sm sm:p-8">
        <div
          className="report-prose max-w-none text-[15px] leading-relaxed text-muted-foreground"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(content, cites) }}
        />
        {streaming && <span className="ml-0.5 inline-block h-3 w-0.5 animate-pulse bg-primary align-text-bottom" />}
      </article>

      {confidence != null && (
        <div className="rounded-lg border border-border bg-card p-4">
          <ConfidenceBar score={confidence} approved={report ? confidence >= 0.7 : approved} />
        </div>
      )}

      {gaps.length > 0 && (
        <div className="rounded-lg border border-border bg-muted p-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-chart-4">Knowledge gaps remaining</h3>
          <ul className="space-y-1.5">
            {gaps.map((g, i) => (
              <li key={i} className="flex gap-2 text-sm text-muted-foreground">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: 'var(--chart-4)' }} />
                <span>{g}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {cites.length > 0 && <SourceList citations={cites} />}
    </div>
  )
}

function SourceList({ citations }: { citations: Citation[] }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sources</h3>
      <ol className="space-y-2.5">
        {[...citations]
          .sort((a, b) => a.n - b.n)
          .map((c) => (
            <li key={c.n} className="flex items-start gap-3">
              <CitationBadge citation={c} />
              <div className="min-w-0 flex-1">
                <a
                  href={c.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block truncate text-sm text-foreground transition hover:text-primary"
                  title={c.title}
                >
                  {c.title || c.url}
                </a>
                <span className="truncate text-xs text-muted-foreground">{hostOf(c.url)}</span>
              </div>
              {typeof c.credibility === 'number' && (
                <span
                  className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium tabular-nums"
                  style={credibilityStyle(c.credibility)}
                  title="Credibility score"
                >
                  {Math.round(c.credibility * 100)}%
                </span>
              )}
            </li>
          ))}
      </ol>
    </div>
  )
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

// Reuse the confidence colour tokens for source credibility.
function credibilityStyle(score: number): CSSProperties {
  const color = score >= 0.75 ? 'var(--conf-high)' : score >= 0.5 ? 'var(--conf-med)' : 'var(--conf-low)'
  return { color }
}

// ---- Lightweight markdown → HTML (no runtime deps) --------------------------

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, '&quot;')
}

// Inline styles reference theme tokens so citations/links swap with the theme.
const CITATION_STYLE = 'background:var(--cite-bg);color:var(--cite-text)'

// Inline-level formatting: links, code, bold/italic, and clickable [n]
// citation markers linked to their source URL.
function renderInline(text: string, cites: Map<number, Citation>): string {
  let t = escapeHtml(text)
  t = t.replace(
    /\[([^\]]+)\]\(([^)\s]+)\)/g,
    (_m, label: string, url: string) =>
      `<a href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer" style="color:var(--primary)" class="underline underline-offset-2">${label}</a>`
  )
  t = t.replace(/`([^`]+)`/g, '<code class="rounded bg-muted px-1 py-0.5 text-[13px]">$1</code>')
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  t = t.replace(/\*([^*]+)\*/g, '<em>$1</em>')
  t = t.replace(/\[(\d+)\]/g, (_m, n: string) => {
    const c = cites.get(Number(n))
    if (c) {
      return `<a href="${escapeAttr(c.url)}" target="_blank" rel="noopener noreferrer" title="${escapeAttr(c.title)}" style="${CITATION_STYLE}" class="mx-0.5 inline-flex items-center rounded px-1 text-[11px] font-bold no-underline align-super hover:opacity-80">${n}</a>`
    }
    return `<sup style="color:var(--primary)" class="font-semibold">[${n}]</sup>`
  })
  return t
}

function renderMarkdown(md: string, citations: Citation[]): string {
  const cites = new Map(citations.map((c) => [c.n, c]))
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  let para: string[] = []
  let inList = false

  const flushPara = () => {
    if (para.length) {
      out.push(`<p>${renderInline(para.join(' '), cites)}</p>`)
      para = []
    }
  }
  const closeList = () => {
    if (inList) {
      out.push('</ul>')
      inList = false
    }
  }

  for (const line of lines) {
    const heading = line.match(/^(#{1,3})\s+(.*)$/)
    const bullet = line.match(/^\s*[-*]\s+(.*)$/)

    if (bullet) {
      flushPara()
      if (!inList) {
        out.push('<ul>')
        inList = true
      }
      out.push(`<li>${renderInline(bullet[1], cites)}</li>`)
      continue
    }

    closeList()

    if (heading) {
      flushPara()
      const level = heading[1].length
      out.push(`<h${level}>${renderInline(heading[2], cites)}</h${level}>`)
      continue
    }

    if (line.trim() === '') {
      flushPara()
      continue
    }

    para.push(line.trim())
  }

  flushPara()
  closeList()
  return out.join('\n')
}
