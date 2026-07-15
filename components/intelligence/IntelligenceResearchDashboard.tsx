'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  ArrowDown,
  ArrowRight,
  ArrowSquareOut,
  ArrowUp,
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
import type { FeedItem, ItemTag, SectionData } from '@/lib/types'
import { getTag } from '@/lib/tags'
import { formatRelativeTime } from '@/lib/utils'

interface IntelligenceResearchDashboardProps {
  sections: Record<string, SectionData>
  overviewBullets: string[]
  isLoading: boolean
  overviewLoading: boolean
  lastUpdatedLabel: string
  totalSectionCount: number
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

type SignalDirection = 'up' | 'down' | 'right'

interface IntelligenceSignal {
  label: string
  status: string
  direction: SignalDirection
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

function stripCitations(value: string): string {
  return value
    .replace(/\[(\d+)\]\((https?:\/\/[^\s)]+)\)/g, '')
    .replace(/^[\s•\-–—]+/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function makeHeadline(bullets: string[]): string {
  const fallback = 'Tracking capability, infrastructure, and policy shifts'
  const first = stripCitations(bullets[0] ?? '')
  if (!first) return fallback

  const firstSentence = first.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim() ?? first
  if (firstSentence.length <= 116) return firstSentence.replace(/[.!?]$/, '')

  const clipped = firstSentence.slice(0, 113)
  const wordBoundary = clipped.lastIndexOf(' ')
  return `${clipped.slice(0, wordBoundary > 72 ? wordBoundary : 113).trim()}…`
}

function cleanTitle(value: string): string {
  return value
    .replace(/^[\p{Extended_Pictographic}\p{Emoji_Presentation}\uFE0F\u200D\s]+/gu, '')
    .trim()
}

function itemToRow(item: FeedItem): IntelligenceRow {
  switch (item.type) {
    case 'paper':
      return {
        id: item.id,
        title: cleanTitle(item.title),
        source: item.id.startsWith('alphaxiv-') ? 'alphaXiv' : 'arXiv',
        time: formatRelativeTime(item.publishedAt),
        timestamp: new Date(item.publishedAt).getTime(),
        url: item.url,
        tag: getTag(item),
      }
    case 'discussion':
      return {
        id: item.id,
        title: cleanTitle(item.title),
        source: item.source,
        time: formatRelativeTime(item.publishedAt),
        timestamp: new Date(item.publishedAt).getTime(),
        url: item.url,
        tag: getTag(item),
      }
    case 'repo':
      return {
        id: item.id,
        title: cleanTitle(`${item.owner}/${item.name} — ${item.description}`),
        source: 'GitHub',
        time: `${item.starsPerDay.toLocaleString(undefined, { maximumFractionDigits: 1 })} est/day`,
        timestamp: 0,
        url: item.url,
        tag: getTag(item),
      }
    case 'earnings':
      return {
        id: item.id,
        title: `${item.companyName} ${item.quarter}`,
        source: item.ticker,
        time: formatRelativeTime(item.reportDate),
        timestamp: new Date(item.reportDate).getTime(),
        url: item.url,
        tag: getTag(item),
      }
    case 'news':
      return {
        id: item.id,
        title: cleanTitle(item.title),
        source: item.canonicalSource || item.publisher || item.source,
        time: formatRelativeTime(item.publishedAt),
        timestamp: new Date(item.publishedAt).getTime(),
        url: item.url,
        tag: getTag(item),
      }
  }
}

function sectionRows(sections: Record<string, SectionData>, sectionId: string): IntelligenceRow[] {
  return (sections[sectionId]?.items ?? []).map(itemToRow)
}

function includesAny(rows: IntelligenceRow[], terms: string[]): boolean {
  const text = rows.map((row) => row.title.toLowerCase()).join(' ')
  return terms.some((term) => text.includes(term))
}

function buildSignals(sections: Record<string, SectionData>): IntelligenceSignal[] {
  const papers = sectionRows(sections, 'papers')
  const infrastructure = sectionRows(sections, 'infra-hardware')
  const policy = sectionRows(sections, 'ai-policy-regulation')
  const repos = sectionRows(sections, 'repos')
  const security = sectionRows(sections, 'cybersecurity')

  const infrastructureConstrained = includesAny(infrastructure, ['capacity', 'power', 'bottleneck', 'shortage', 'constraint'])
  const policyTightening = includesAny(policy, ['regulation', 'rule', 'act', 'compliance', 'enforcement'])
  const securityElevated = includesAny(security, ['attack', 'breach', 'threat', 'vulnerability', 'malware'])

  return [
    { label: 'Frontier models', status: papers.length > 0 ? 'Advancing' : 'Monitoring', direction: papers.length > 0 ? 'up' : 'right' },
    { label: 'Infrastructure', status: infrastructureConstrained ? 'Constrained' : infrastructure.length > 0 ? 'Active' : 'Monitoring', direction: infrastructureConstrained ? 'down' : infrastructure.length > 0 ? 'up' : 'right' },
    { label: 'Policy', status: policyTightening ? 'Tightening' : policy.length > 0 ? 'Active' : 'Monitoring', direction: policyTightening ? 'right' : policy.length > 0 ? 'up' : 'right' },
    { label: 'Open source', status: repos.length > 0 ? 'Gaining' : 'Monitoring', direction: repos.length > 0 ? 'up' : 'right' },
    { label: 'Security', status: securityElevated ? 'Elevated' : security.length > 0 ? 'Active' : 'Monitoring', direction: securityElevated ? 'right' : security.length > 0 ? 'up' : 'right' },
  ]
}

function SignalArrow({ direction }: { direction: SignalDirection }) {
  if (direction === 'up') return <ArrowUp size={14} weight="bold" aria-hidden="true" />
  if (direction === 'down') return <ArrowDown size={14} weight="bold" aria-hidden="true" />
  return <ArrowRight size={14} weight="bold" aria-hidden="true" />
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

  useEffect(() => {
    if (!open) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
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
        className="intelligence-category-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="intelligence-category-title"
      >
        <header className="intelligence-category-header">
          <div>
            <p>AI Research · {category.rows.length} current items</p>
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
  overviewBullets,
  isLoading,
  overviewLoading,
  lastUpdatedLabel,
  totalSectionCount,
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
  const sourceStream = [
    ...sectionRows(sections, 'ai-news-general').slice(0, 1),
    ...sectionRows(sections, 'ai-policy-regulation').slice(0, 1),
    ...sectionRows(sections, 'infra-hardware').slice(0, 1),
    ...sectionRows(sections, 'cybersecurity').slice(0, 1),
    ...sectionRows(sections, 'papers').slice(0, 1),
  ]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 5)

  const loadedSectionCount = Object.values(sections).filter((section) => section.items.length > 0).length
  const sourceCoverage = totalSectionCount > 0
    ? Math.round((loadedSectionCount / totalSectionCount) * 100)
    : 0
  const signals = buildSignals(sections)
  const headline = makeHeadline(overviewBullets)

  const topicColumns: IntelligenceCategory[] = [
    { id: 'research-papers', title: 'Research Papers', viewLabel: 'papers', rows: sectionRows(sections, 'papers'), icon: <FileText size={18} aria-hidden="true" /> },
    { id: 'policy-regulation', title: 'Policy & Regulation', viewLabel: 'policy', rows: sectionRows(sections, 'ai-policy-regulation'), icon: <Shield size={18} aria-hidden="true" /> },
    { id: 'infrastructure', title: 'Infrastructure', viewLabel: 'infrastructure', rows: sectionRows(sections, 'infra-hardware'), icon: <HardDrives size={18} aria-hidden="true" /> },
    { id: 'open-source', title: 'Open Source', viewLabel: 'open source', rows: sectionRows(sections, 'repos'), icon: <Code size={18} aria-hidden="true" /> },
  ]

  const companyTechnologyColumns: IntelligenceCategory[] = [
    { id: 'venture-capital', title: 'Venture Capital', viewLabel: 'venture capital', rows: sectionRows(sections, 'venture-capital'), icon: <CurrencyCircleDollar size={18} aria-hidden="true" /> },
    { id: 'startups', title: 'Startups', viewLabel: 'startups', rows: sectionRows(sections, 'startups'), icon: <RocketLaunch size={18} aria-hidden="true" /> },
    { id: 'new-technology', title: 'New Technology', viewLabel: 'new technology', rows: sectionRows(sections, 'new-technology'), icon: <Circuitry size={18} aria-hidden="true" /> },
  ]
  const categories = [...topicColumns, ...companyTechnologyColumns]
  const activeCategory = categories.find((category) => category.id === activeCategoryId) ?? null

  return (
    <article className="intelligence-dashboard">
      <section className="intelligence-state-hero" aria-labelledby="intelligence-state-title">
        <p className="intelligence-eyebrow">Intelligence state</p>
        <h1 id="intelligence-state-title" className="intelligence-display">{headline}</h1>
        <div className="intelligence-state-meta">
          <span>{isLoading ? 'Loading source coverage' : `${sourceCoverage}% source coverage`}</span>
          <span>Sources current · {lastUpdatedLabel}</span>
        </div>
      </section>

      <section className="intelligence-signal-tape" aria-label="Intelligence signals">
        {signals.map((signal) => (
          <div key={signal.label} className={`intelligence-signal intelligence-signal-${signal.direction}`}>
            <strong>{signal.label}</strong>
            <SignalArrow direction={signal.direction} />
            <span>{signal.status}</span>
          </div>
        ))}
      </section>

      <section className="intelligence-brief-grid">
        <div className="intelligence-changes-panel">
          <h2>What changed</h2>
          {overviewLoading ? (
            <div className="intelligence-brief-skeleton" aria-label="Loading intelligence overview">
              {Array.from({ length: 4 }).map((_, index) => <span key={index} />)}
            </div>
          ) : overviewBullets.length > 0 ? (
            <ol>
              {overviewBullets.slice(0, 4).map((bullet, index) => (
                <li key={`${index}-${bullet.slice(0, 24)}`}>
                  <p>{renderWithCitations(bullet)}</p>
                  <span>Source synthesis · Current intelligence feeds</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="intelligence-panel-empty">The overview synthesis is not available yet. Live source items remain available at right.</p>
          )}
        </div>

        <div className="intelligence-source-panel">
          <h2>Source stream</h2>
          {sourceStream.length > 0 ? (
            <ol>
              {sourceStream.map((row, index) => (
                <li key={`${row.id}-${index}`}>
                  <span>{index + 1}</span>
                  <a href={row.url} target="_blank" rel="noopener noreferrer">
                    <strong>{row.title}</strong>
                    <small>{row.source}</small>
                  </a>
                  {row.tag === 'breaking' && <em>Breaking</em>}
                  <time>{row.time}</time>
                  <CaretRight size={15} aria-hidden="true" />
                </li>
              ))}
            </ol>
          ) : isLoading ? (
            <div className="intelligence-source-skeleton" aria-label="Loading source stream">
              {Array.from({ length: 5 }).map((_, index) => <span key={index} />)}
            </div>
          ) : (
            <p className="intelligence-panel-empty">No current source items are available.</p>
          )}
          <a className="intelligence-view-all" href="#research-papers">
            View the research brief <CaretRight size={14} aria-hidden="true" />
          </a>
        </div>
      </section>

      <section className="intelligence-topic-grid intelligence-topic-grid-primary" aria-label="Intelligence topic summaries">
        {topicColumns.map((column) => (
          <IntelligenceColumn key={column.id} {...column} onView={openCategory} />
        ))}
      </section>

      <section
        className="intelligence-topic-grid intelligence-topic-grid-company"
        aria-label="Venture capital, startup, and technology intelligence"
      >
        {companyTechnologyColumns.map((column) => (
          <IntelligenceColumn key={column.id} {...column} onView={openCategory} />
        ))}
      </section>

      <CategoryDetailDialog
        category={activeCategory}
        lastUpdatedLabel={lastUpdatedLabel}
        onClose={closeCategory}
      />
    </article>
  )
}
