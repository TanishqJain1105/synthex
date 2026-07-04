import { Citation } from '@synthex/shared/types/research.types'

type Props = { citation: Citation }

// A clickable [n] source marker. Used in the Sources list beneath the report;
// inline [n] markers inside the streamed markdown are rendered by ReportViewer.
export function CitationBadge({ citation }: Props) {
  return (
    <a
      href={citation.url}
      target="_blank"
      rel="noopener noreferrer"
      title={citation.title}
      className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-md px-1 text-[11px] font-bold transition hover:opacity-80"
      style={{ background: 'var(--cite-bg)', color: 'var(--cite-text)' }}
    >
      {citation.n}
    </a>
  )
}
