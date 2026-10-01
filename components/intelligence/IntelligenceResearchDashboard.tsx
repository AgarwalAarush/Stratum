'use client'

import type { OverviewData } from '../../lib/types'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  ArrowSquareOut,
  CaretRight,
  Circuitry,
  Code,
  CurrencyCircleDollar,
  FileText,
  HardDrives,
  RocketLaunch,
  Shield,
  X,
} from '@phosphor-icons/react'
import type { FeedItem, ItemTag, ScopeDef, SectionData } from '@/lib/types'
import { getTag } from '@/lib/tags'
import { formatRelativeTime } from '@/lib/utils'

interface IntelligenceResearchDashboardProps {
  sections: Record<string, SectionData>
  relativeTimeAsOf: string
  overviewArtifact?: OverviewData
  overviewBullets: string[]
  isLoading: boolean
  overviewLoading: boolean
  lastUpdatedLabel: string
  totalSectionCount: number
  scope?: ScopeDef
}

interface IntelligenceRow {
  id: string
  title: string
  source: string
  time: string
  timestamp: number
  url: string
  tag?: ItemTag
}

interface IntelligenceCategory {
  id: string
  title: string
  viewLabel: string
  rows: IntelligenceRow[]
  icon: ReactNode
}

const CITATION_RE = /\[(\d+)\]\((https?:\/\/[^\s)]+)\)/g

function renderWithCitations(value: string): ReactNode {
  const parts: ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  CITATION_RE.lastIndex = 0
  while ((match = CITATION_RE.exec(value)) !== null) {
    if (match.index > lastIndex) parts.push(value.slice(lastIndex, match.index))
    parts.push(
      <a
        key={`${match[1]}-${match.index}`}
        href={match[2]}
        target="_blank"
        rel="noopener noreferrer"
        className="intelligence-citation"
        aria-label={`Open source ${match[1]}`}
      >
        {match[1]}
      </a>,
    )
    lastIndex = match.index + match[0].length
  }

  if (parts.length === 0) return value
  if (lastIndex < value.length) parts.push(value.slice(lastIndex))
  return <>{parts}</>
}

function cleanTitle(value: string): string {
  return value
    .replace(/^[\p{Extended_Pictographic}\p{Emoji_Presentation}\uFE0F\u200D\s]+/gu, '')
    .trim()
}

function itemToRow(item: FeedItem, referenceTimeMs: number): IntelligenceRow {
  switch (item.type) {
    case 'paper':
      return {
        id: item.id,
        title: cleanTitle(item.title),
        source: item.id.startsWith('alphaxiv-') ? 'alphaXiv' : 'arXiv',
        time: formatRelativeTime(item.publishedAt, referenceTimeMs),
        timestamp: new Date(item.publishedAt).getTime(),
        url: item.url,
        tag: getTag(item),
      }
    case 'discussion':
      return {
        id: item.id,
        title: cleanTitle(item.title),
        source: item.source,
        time: formatRelativeTime(item.publishedAt, referenceTimeMs),
        timestamp: new Date(item.publishedAt).getTime(),
        url: item.url,
        tag: getTag(item),
      }
    case 'repo':
      return {
        id: item.id,
        title: cleanTitle(`${item.owner}/${item.name} — ${item.description}`),
        source: 'GitHub',
        time: `${item.starsPerDay.toLocaleString('en-US', { maximumFractionDigits: 1 })} est/day`,
        timestamp: 0,
        url: item.url,
        tag: getTag(item),
      }
    case 'earnings':
      return {
        id: item.id,
        title: `${item.companyName} ${item.quarter}`,
        source: item.ticker,
        time: formatRelativeTime(item.reportDate, referenceTimeMs),
        timestamp: new Date(item.reportDate).getTime(),
        url: item.url,
        tag: getTag(item),
      }
    case 'news':
      return {
        id: item.id,
        title: cleanTitle(item.title).replace(/ - ([^-]{1,45})$/, (suffix, publisher: string) => [item.publisher, item.canonicalSource, item.source].some((source) => source?.toLowerCase() === publisher.trim().toLowerCase()) ? '' : suffix),
        source: item.canonicalSource || item.publisher || item.source,
        time: formatRelativeTime(item.publishedAt, referenceTimeMs),
        timestamp: new Date(item.publishedAt).getTime(),
        url: item.url,
        tag: getTag(item),
      }
  }
}

function sectionRows(sections: Record<string, SectionData>, sectionId: string, referenceTimeMs: number): IntelligenceRow[] {
  return (sections[sectionId]?.items ?? []).map((item) => itemToRow(item, referenceTimeMs))
}

function IntelligenceColumn({
  id,
  title,
  viewLabel,
  rows,
  icon,
  onView,
}: IntelligenceCategory & { onView: (categoryId: string, trigger: HTMLButtonElement) => void }) {
  const visibleRows = rows.slice(0, 3)

  return (
    <section id={id} className="intelligence-topic-column" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>
        {icon}
        <span>{title}</span>
        <small className="intelligence-topic-count">{rows.length}</small>
      </h2>

      {visibleRows.length > 0 ? (
        <ol>
          {visibleRows.map((row, index) => (
            <li key={row.id}>
              <span>{index + 1}</span>
              <a href={row.url} target="_blank" rel="noopener noreferrer">
                <strong>{row.title}</strong>
                <small>{row.source} · {row.time}</small>
              </a>
            </li>
          ))}
        </ol>
      ) : (
        <p className="intelligence-topic-empty">No current items from this source group.</p>
      )}

      {visibleRows[0] && (
        <button
          type="button"
          className="intelligence-topic-link"
          onClick={(event) => onView(id, event.currentTarget)}
          aria-haspopup="dialog"
        >
          View {viewLabel} <CaretRight size={13} aria-hidden="true" />
        </button>
      )}
    </section>
  )
}

function CategoryDetailDialog({
  category,
  lastUpdatedLabel,
  onClose,
}: {
  category: IntelligenceCategory | null
  lastUpdatedLabel: string
  onClose: () => void
}) {
  const open = category !== null
  const dialogRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!open) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'Tab') {
        const controls = dialogRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')
        if (!controls?.length) return
        const first = controls[0]
        const last = controls[controls.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
      }
    }

    window.addEventListener('keydown', onKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose, open])

  if (!category) return null

  return (
    <div className="intelligence-category-overlay">
      <div
        className="intelligence-category-backdrop"
        onClick={onClose}
        aria-hidden="true"
      />

      <section
        ref={dialogRef}
        className="intelligence-category-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="intelligence-category-title"
      >
        <header className="intelligence-category-header">
          <div>
            <p>{category.rows.length} current source items</p>
            <h2 id="intelligence-category-title">
              {category.icon}
              <span>{category.title}</span>
            </h2>
          </div>
          <div className="intelligence-category-header-meta">
            <span>Updated {lastUpdatedLabel}</span>
            <button type="button" onClick={onClose} autoFocus aria-label={`Close ${category.title} view`}>
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="intelligence-category-body">
          {category.rows.length > 0 ? (
            <ol>
              {category.rows.map((row, index) => (
                <li key={`${row.id}-${index}`}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <a href={row.url} target="_blank" rel="noopener noreferrer">
                    <strong>{row.title}</strong>
                    <small>{row.source}</small>
                  </a>
                  {row.tag && <em>{row.tag}</em>}
                  <time>{row.time}</time>
                  <ArrowSquareOut size={15} aria-hidden="true" />
                </li>
              ))}
            </ol>
          ) : (
            <div className="intelligence-category-empty">
              <p>No current items are available for this category.</p>
              <span>The feed will populate after the next successful source refresh.</span>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

export function IntelligenceResearchDashboard({
  sections,
  relativeTimeAsOf,
  overviewArtifact,
  overviewBullets,
  isLoading,
  overviewLoading,
  lastUpdatedLabel,
  totalSectionCount,
  scope,
}: IntelligenceResearchDashboardProps) {
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null)
  const categoryTriggerRef = useRef<HTMLButtonElement | null>(null)
  const openCategory = useCallback((categoryId: string, trigger: HTMLButtonElement) => {
    categoryTriggerRef.current = trigger
    setActiveCategoryId(categoryId)
  }, [])
  const closeCategory = useCallback(() => {
    setActiveCategoryId(null)
    window.requestAnimationFrame(() => categoryTriggerRef.current?.focus())
  }, [])
  const referenceTimeMs = Date.parse(relativeTimeAsOf)
  const loadedSectionCount = Object.values(sections).filter((section) => section.items.length > 0).length

  const topicColumns: IntelligenceCategory[] = [
    { id: 'research-papers', title: 'Research Papers', viewLabel: 'papers', rows: sectionRows(sections, 'papers', referenceTimeMs), icon: <FileText size={18} aria-hidden="true" /> },
    { id: 'policy-regulation', title: 'Policy & Regulation', viewLabel: 'policy', rows: sectionRows(sections, 'ai-policy-regulation', referenceTimeMs), icon: <Shield size={18} aria-hidden="true" /> },
    { id: 'infrastructure', title: 'Infrastructure', viewLabel: 'infrastructure', rows: sectionRows(sections, 'infra-hardware', referenceTimeMs), icon: <HardDrives size={18} aria-hidden="true" /> },
    { id: 'open-source', title: 'Open Source', viewLabel: 'open source', rows: sectionRows(sections, 'repos', referenceTimeMs), icon: <Code size={18} aria-hidden="true" /> },
  ]

  const companyTechnologyColumns: IntelligenceCategory[] = [
    { id: 'venture-capital', title: 'Venture Capital', viewLabel: 'venture capital', rows: sectionRows(sections, 'venture-capital', referenceTimeMs), icon: <CurrencyCircleDollar size={18} aria-hidden="true" /> },
    { id: 'startups', title: 'Startups', viewLabel: 'startups', rows: sectionRows(sections, 'startups', referenceTimeMs), icon: <RocketLaunch size={18} aria-hidden="true" /> },
    { id: 'new-technology', title: 'New Technology', viewLabel: 'new technology', rows: sectionRows(sections, 'new-technology', referenceTimeMs), icon: <Circuitry size={18} aria-hidden="true" /> },
  ]
  const isGlobalNews = scope?.id === 'global-news'
  const categories: IntelligenceCategory[] = isGlobalNews
    ? scope.sections.map((section) => ({ id: section.id, title: section.label, viewLabel: section.label.toLowerCase(), rows: sectionRows(sections, section.id, referenceTimeMs), icon: <FileText size={18} aria-hidden="true" /> }))
    : [...topicColumns, ...companyTechnologyColumns,
      { id: 'ai-news', title: 'AI News', viewLabel: 'AI news', rows: sectionRows(sections, 'ai-news-general', referenceTimeMs), icon: <FileText size={18} aria-hidden="true" /> },
      { id: 'security', title: 'Security', viewLabel: 'security', rows: sectionRows(sections, 'cybersecurity', referenceTimeMs), icon: <Shield size={18} aria-hidden="true" /> },
      { id: 'tech-events', title: 'Technology Events', viewLabel: 'technology events', rows: sectionRows(sections, 'tech-events', referenceTimeMs), icon: <Circuitry size={18} aria-hidden="true" /> },
      { id: 'discussions', title: 'Discussions', viewLabel: 'discussions', rows: sectionRows(sections, 'discussions', referenceTimeMs), icon: <Code size={18} aria-hidden="true" /> },
    ]
  const activeCategory = categories.find((category) => category.id === activeCategoryId) ?? null
  const featuredCategory = categories[0]
  const remainingCategories = categories.slice(1)
  const seenUrls = new Set<string>()
  const sourceStream = categories.flatMap((category) => category.rows.slice(0, 2).map((row) => ({ ...row, category: category.title })))
    .sort((a, b) => b.timestamp - a.timestamp)
    .filter((row) => { if (seenUrls.has(row.url)) return false; seenUrls.add(row.url); return true })
    .slice(0, 6)
  const signalIds = isGlobalNews ? categories.slice(0, 5).map((category) => category.id) : ['research-papers', 'infrastructure', 'policy-regulation', 'open-source', 'security']
  const signals = signalIds.flatMap((id) => categories.find((category) => category.id === id) ?? [])
  const hasOverview = overviewBullets.length > 0

  return (
    <article className="intelligence-dashboard">
      <header className="intelligence-state-hero">
        <div>
          <p className="intelligence-eyebrow">Intelligence / {isGlobalNews ? 'World affairs' : 'Technology'}</p>
          <h1 className="intelligence-display">{isGlobalNews ? 'Global News' : 'AI Research'}</h1>
          <p className="intelligence-deck">{isGlobalNews ? 'Politics, economies and the forces connecting them.' : 'Capability, infrastructure and policy. The sources behind the shifts.'}</p>
        </div>
        <div className="intelligence-state-meta">
          <span>{isLoading ? 'Loading feed panels' : `${loadedSectionCount}/${totalSectionCount} feed panels with items`}</span>
          <span>Latest feed retrieval · {lastUpdatedLabel}</span>
        </div>
      </header>

      <nav className="intelligence-signal-tape" aria-label="Browse source groups">
        {signals.map((signal) => (
          <button key={signal.id} className="intelligence-signal" type="button" onClick={(event) => openCategory(signal.id, event.currentTarget)} aria-haspopup="dialog">
            <strong>{signal.title}</strong><span>{signal.rows.length}</span>
          </button>
        ))}
      </nav>

      {hasOverview || overviewLoading ? (
        <section className="intelligence-changes-panel" aria-labelledby="intelligence-changes-title">
          <div className="intelligence-section-heading">
            <h2 id="intelligence-changes-title">What changed</h2>
            <span>{overviewLoading ? 'Loading synthesis' : overviewArtifact?.stale ? 'Last accepted analysis' : 'Source synthesis'}</span>
          </div>
          {overviewLoading ? (
            <div className="intelligence-brief-skeleton" aria-label="Loading intelligence overview">{Array.from({ length: 2 }).map((_, index) => <span key={index} />)}</div>
          ) : (
            <>
              <ol>{overviewBullets.slice(0, 2).map((bullet, index) => <li key={index}><p>{renderWithCitations(bullet)}</p></li>)}</ol>
              {overviewBullets.length > 2 && <details className="intelligence-more-synthesis"><summary>Read all {overviewBullets.length} observations</summary><ol start={3}>{overviewBullets.slice(2).map((bullet, index) => <li key={index}>{renderWithCitations(bullet)}</li>)}</ol></details>}
            </>
          )}
          {overviewArtifact && <details className="intelligence-artifact-details"><summary>Analysis provenance{overviewArtifact.generatedAt ? ` · generated ${formatRelativeTime(overviewArtifact.generatedAt, referenceTimeMs)}` : ''}</summary><p>{overviewArtifact.readiness} · Generated {overviewArtifact.generatedAt ?? 'unknown'} · Sources through {overviewArtifact.dataAsOf ?? 'unknown'}{overviewArtifact.errors?.length ? ` · ${overviewArtifact.errors.join('; ')}` : ''}</p></details>}
        </section>
      ) : (
        <section className="intelligence-synthesis-notice" role="status">
          <FileText size={18} aria-hidden="true" /><div><strong>Synthesis unavailable</strong><span>Browse current source feeds below.</span></div>
          {overviewArtifact?.readiness && <details><summary>{overviewArtifact.readiness} · Details</summary><p>{overviewArtifact.errors?.join('; ') || 'No accepted intelligence is available.'}</p></details>}
        </section>
      )}

      <section className="intelligence-brief-grid" aria-label="Latest sources">
        <div className="intelligence-source-panel">
          <div className="intelligence-section-heading"><h2>Latest across the feeds</h2><span>Original sources</span></div>
          {sourceStream.length > 0 ? (
            <ol>{sourceStream.map((row, index) => (
              <li key={`${row.id}-${index}`}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <a href={row.url} target="_blank" rel="noopener noreferrer"><strong>{row.title}</strong><small>{row.category} · {row.source}{row.tag === 'breaking' ? ' · Breaking' : ''}</small></a>
                <time>{row.time}</time><ArrowSquareOut size={15} aria-hidden="true" />
              </li>
            ))}</ol>
          ) : isLoading ? (
            <div className="intelligence-source-skeleton" aria-label="Loading source stream">{Array.from({ length: 5 }).map((_, index) => <span key={index} />)}</div>
          ) : <p className="intelligence-panel-empty">No current source items are available.</p>}
        </div>
        {featuredCategory && <IntelligenceColumn {...featuredCategory} onView={openCategory} />}
      </section>

      <div className="intelligence-section-heading intelligence-topics-heading"><h2>Explore the sources</h2><span>{categories.length} source groups</span></div>
      <section className="intelligence-topic-grid intelligence-topic-grid-primary intelligence-topic-grid-company" aria-label="Intelligence topic summaries">
        {remainingCategories.map((column) => <IntelligenceColumn key={column.id} {...column} onView={openCategory} />)}
      </section>
      <CategoryDetailDialog category={activeCategory} lastUpdatedLabel={lastUpdatedLabel} onClose={closeCategory} />
    </article>
  )
}
