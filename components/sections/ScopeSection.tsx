'use client'

import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { FeedItem } from '@/lib/types'
import { formatFutureTime, formatRelativeTime } from '@/lib/utils'

type ItemTag = 'new' | 'hot' | 'breaking' | 'verified' | 'beta'

interface ScopeSectionProps {
  label: string
  items: FeedItem[]
  defaultExpanded?: boolean
  collapseAfter?: number
  columns?: number
  fillByColumn?: boolean
}

interface DisplayRow {
  id: string
  title: string
  source: string
  time: string
  meta?: string
  url: string
  tag?: ItemTag
  change?: number
}

const tagStyles: Record<ItemTag, { label: string; color: string; bg: string }> = {
  new: { label: 'NEW', color: '#1a6b2e', bg: '#e8f5ec' },
  hot: { label: 'HOT', color: '#a33000', bg: '#feeee8' },
  breaking: { label: 'BREAKING', color: '#991b1b', bg: '#fee2e2' },
  verified: { label: 'VERIFIED', color: '#1e3a5f', bg: '#dbeafe' },
  beta: { label: 'BETA', color: '#5a3a00', bg: '#fef3c7' },
}

function getTag(item: FeedItem): ItemTag | undefined {
  if (item.type === 'discussion' && item.points >= 500) return 'hot'
  if (item.type === 'repo' && item.starsPerDay >= 15) return 'hot'
  if (item.type === 'earnings') {
    if (item.beat === true) return 'verified'
    if (item.beat === false) return 'breaking'
  }
  if (item.type === 'news') {
    const category = (item.category ?? '').toLowerCase()
    if (category.includes('release')) return 'new'
    if (category.includes('benchmark')) return 'verified'
  }
  return undefined
}

function getRow(item: FeedItem): DisplayRow {
  switch (item.type) {
    case 'paper': {
      const leadAuthor = item.authors.length > 0 ? item.authors[0] : 'Unknown'
      const authorText = item.authors.length > 1 ? `${leadAuthor} et al.` : leadAuthor
      const categories = item.categories.slice(0, 2).join(', ')
      return {
        id: item.id,
        title: item.title,
        source: 'arXiv',
        time: formatRelativeTime(item.publishedAt),
        meta: [authorText, categories].filter(Boolean).join(' · '),
        url: item.url,
        tag: getTag(item),
      }
    }
    case 'discussion':
      return {
        id: item.id,
        title: item.title,
        source: item.source,
        time: formatRelativeTime(item.publishedAt),
        meta: `${item.points} points · ${item.commentCount} comments`,
        url: item.url,
        tag: getTag(item),
      }
    case 'repo':
      return {
        id: item.id,
        title: `${item.owner}/${item.name} — ${item.description}`,
        source: 'GitHub',
        time: `↑ ${item.starsPerDay.toLocaleString(undefined, { maximumFractionDigits: 1 })} est/day`,
        meta: `${item.language} · ${item.totalStars.toLocaleString()} stars`,
        url: item.url,
        tag: getTag(item),
      }
    case 'earnings': {
      const hasEps = item.epsActual !== undefined && item.epsEstimate !== undefined && item.epsEstimate !== 0
      const change = hasEps
        ? ((item.epsActual! - item.epsEstimate!) / Math.abs(item.epsEstimate!)) * 100
        : undefined
      const status = item.beat === true ? 'beat' : item.beat === false ? 'miss' : ''
      return {
        id: item.id,
        title: `${item.companyName} ${item.quarter}`,
        source: item.ticker,
        time: item.beat === undefined ? formatFutureTime(item.reportDate) : formatRelativeTime(item.reportDate),
        meta: status ? status.toUpperCase() : undefined,
        url: item.url,
        tag: getTag(item),
        change,
      }
    }
    case 'news':
      return {
        id: item.id,
        title: item.title,
        source: item.source,
        time: formatRelativeTime(item.publishedAt),
        meta: item.category,
        url: item.url,
        tag: getTag(item),
      }
  }
}

function ChangeChip({ value }: { value: number }) {
  const rounded = Number(value.toFixed(2))
  const isPositive = rounded > 0
  const isNeutral = Math.abs(rounded) < 0.05
  const label = `${isPositive ? '+' : ''}${rounded.toFixed(2)}%`

  if (isNeutral) {
    return (
      <span className="font-mono text-[11px] text-[var(--text-muted)]">
        {label}
      </span>
    )
  }

  return (
    <span
      className="font-mono text-[11px] font-medium px-1.5 py-0.5 rounded-[2px] tracking-[0.02em]"
      style={{
        color: isPositive ? '#166534' : '#991b1b',
        backgroundColor: isPositive ? '#dcfce7' : '#fee2e2',
      }}
    >
      {label}
    </span>
  )
}

function SectionItemRow({
  row,
  rank,
  className = '',
}: {
  row: DisplayRow
  rank: number
  className?: string
}) {
  const tag = row.tag ? tagStyles[row.tag] : null

  return (
    <a
      href={row.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`group flex items-start gap-3 px-6 py-2.5 border-b border-black/5 hover:bg-black/[0.025] transition-colors ${className}`}
    >
      <span className="shrink-0 mt-0.5 w-4 text-right font-mono text-[10px] text-black/25">
        {rank}
      </span>

      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2 flex-wrap">
          <span className="text-[13px] text-[var(--text)] leading-[1.4] whitespace-normal break-words group-hover:underline decoration-dotted underline-offset-2">
            {row.title}
          </span>
          {tag && (
            <span
              className="font-mono text-[9px] font-semibold tracking-[0.1em] px-1 py-0.5 rounded-[2px] shrink-0 self-center"
              style={{ color: tag.color, backgroundColor: tag.bg }}
            >
              {tag.label}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2.5 mt-0.5 flex-wrap">
          <span className="font-mono text-[11px] text-black/55 tracking-[0.02em]">
            {row.source}
          </span>
          <span className="font-mono text-[10px] text-black/25">·</span>
          <span className="font-mono text-[11px] text-black/40">
            {row.time}
          </span>
          {row.meta && (
            <>
              <span className="font-mono text-[10px] text-black/25">·</span>
              <span className="font-mono text-[11px] text-black/50 tracking-[0.02em]">
                {row.meta}
              </span>
            </>
          )}
          {row.change !== undefined && (
            <ChangeChip value={row.change} />
          )}
        </div>
      </div>
    </a>
  )
}

interface RankedRow {
  row: DisplayRow
  rank: number
}

function reorderByColumns(rows: RankedRow[], columns: number): RankedRow[] {
  if (columns <= 1 || rows.length <= 1) return rows

  const rowCount = Math.ceil(rows.length / columns)
  const ordered: RankedRow[] = []

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    for (let colIndex = 0; colIndex < columns; colIndex += 1) {
      const sourceIndex = colIndex * rowCount + rowIndex
      const candidate = rows[sourceIndex]
      if (candidate) {
        ordered.push(candidate)
      }
    }
  }

  return ordered
}

export function ScopeSection({
  label,
  items,
  defaultExpanded = true,
  collapseAfter = 5,
  columns = 1,
  fillByColumn = false,
}: ScopeSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const [showAll, setShowAll] = useState(false)
  const rows = useMemo(() => items.map(getRow), [items])
  const useGridLayout = columns > 1
  const gridClassName = useMemo(() => {
    if (columns >= 3) return 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3'
    if (columns === 2) return 'grid grid-cols-1 lg:grid-cols-2'
    return 'grid grid-cols-1'
  }, [columns])

  const visibleRows = showAll ? rows : rows.slice(0, collapseAfter)
  const rankedRows = useMemo(
    () => visibleRows.map((row, index) => ({ row, rank: index + 1 })),
    [visibleRows],
  )
  const orderedGridRows = useMemo(
    () => (fillByColumn ? reorderByColumns(rankedRows, columns) : rankedRows),
    [fillByColumn, rankedRows, columns],
  )
  const hiddenCount = Math.max(0, rows.length - collapseAfter)

  return (
    <section className="border-b border-black/10">
      <button
        onClick={() => setExpanded((value) => !value)}
        className="w-full flex items-center justify-between px-6 py-2 border-b border-transparent hover:bg-black/[0.015] transition-colors"
        style={{ borderBottomColor: expanded ? 'rgba(0,0,0,0.06)' : 'transparent' }}
      >
        <div className="flex items-center gap-2">
          {expanded ? (
            <ChevronDown size={11} className="text-black/35" />
          ) : (
            <ChevronRight size={11} className="text-black/35" />
          )}
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.15em] text-black/70">
            {label}
          </span>
          <span className="font-mono text-[10px] text-black/30 tracking-[0.05em]">
            {rows.length}
          </span>
        </div>
      </button>

      {expanded && (
        <div>
          {rows.length === 0 && (
            <p className="px-6 py-4 font-mono text-[11px] text-black/40">
              No items available.
            </p>
          )}
          {useGridLayout ? (
            <div
              className={`${gridClassName} border-b border-black/5`}
            >
              {orderedGridRows.map(({ row, rank }) => (
                <SectionItemRow
                  key={row.id}
                  row={row}
                  rank={rank}
                  className="h-full border-b-0"
                />
              ))}
            </div>
          ) : (
            rankedRows.map(({ row, rank }) => (
              <SectionItemRow key={row.id} row={row} rank={rank} />
            ))
          )}
          {!showAll && hiddenCount > 0 && (
            <button
              onClick={() => setShowAll(true)}
              className="w-full px-6 py-2 text-left hover:bg-black/[0.015] transition-colors"
            >
              <span className="font-mono text-[11px] text-black/45 tracking-[0.04em] hover:text-black/80">
                + {hiddenCount} more
              </span>
            </button>
          )}
        </div>
      )}
    </section>
  )
}
