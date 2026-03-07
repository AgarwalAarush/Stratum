'use client'

import { useState } from 'react'
import type { PeriodicOverviewData } from '@/lib/types'

interface PeriodicOverviewProps {
  weekly: PeriodicOverviewData | null
  monthly: PeriodicOverviewData | null
  isLoading: boolean
}

function formatDateRange(start: string, end: string): string {
  if (!start || !end) return ''
  const fmt = (d: string) => {
    const date = new Date(d + 'T00:00:00')
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }
  return `${fmt(start)} – ${fmt(end)}`
}

function renderContent(content: string) {
  if (!content) return null

  const blocks = content.split('\n\n')
  return blocks.map((block, i) => {
    const trimmed = block.trim()
    if (!trimmed) return null

    // Check if this block is a list
    const lines = trimmed.split('\n')
    const isList = lines.every((l) => /^[-*]\s/.test(l.trim()) || l.trim() === '')

    if (isList) {
      return (
        <ul key={i} className="space-y-1.5 my-3">
          {lines
            .filter((l) => l.trim())
            .map((line, j) => (
              <li key={j} className="flex items-start gap-2">
                <span className="font-mono text-[12px] text-text-muted shrink-0 mt-0.5">→</span>
                <span className="text-[13px] text-[var(--text)] leading-[1.5]">
                  {line.replace(/^[-*]\s+/, '')}
                </span>
              </li>
            ))}
        </ul>
      )
    }

    // Check if line is a heading (starts with # or **)
    if (/^#{1,3}\s/.test(trimmed)) {
      return (
        <h3
          key={i}
          className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-text-dim mt-4 mb-1"
        >
          {trimmed.replace(/^#{1,3}\s+/, '')}
        </h3>
      )
    }

    return (
      <p key={i} className="text-[13px] text-[var(--text)] leading-[1.6] my-2">
        {trimmed}
      </p>
    )
  })
}

export function PeriodicOverview({ weekly, monthly, isLoading }: PeriodicOverviewProps) {
  const [activeTab, setActiveTab] = useState<'weekly' | 'monthly'>('weekly')

  const hasWeekly = weekly && weekly.content
  const hasMonthly = monthly && monthly.content
  if (!isLoading && !hasWeekly && !hasMonthly) return null

  const active = activeTab === 'weekly' ? weekly : monthly

  return (
    <section className="border-b border-border flex flex-col">
      <header className="w-full h-[var(--section-header-height)] shrink-0 flex items-center justify-between px-6 py-2 border-b border-border">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.15em] text-text-dim">
            Intelligence Briefing
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => setActiveTab('weekly')}
              className={`font-mono text-[10px] px-2 py-0.5 rounded transition-colors ${
                activeTab === 'weekly'
                  ? 'bg-surface-2 text-text-dim'
                  : 'text-text-muted hover:text-text-dim'
              }`}
            >
              Weekly
            </button>
            <button
              onClick={() => setActiveTab('monthly')}
              className={`font-mono text-[10px] px-2 py-0.5 rounded transition-colors ${
                activeTab === 'monthly'
                  ? 'bg-surface-2 text-text-dim'
                  : 'text-text-muted hover:text-text-dim'
              }`}
            >
              Biweekly
            </button>
          </div>
        </div>
        {active && active.periodStart && active.periodEnd && (
          <span className="font-mono text-[10px] text-text-muted tracking-[0.05em]">
            {formatDateRange(active.periodStart, active.periodEnd)}
          </span>
        )}
      </header>

      <div className="px-6 py-4">
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-4 rounded bg-surface-2 animate-pulse"
                style={{ width: `${50 + (i % 4) * 15}%` }}
              />
            ))}
          </div>
        ) : active && active.content ? (
          <div className="max-w-3xl">{renderContent(active.content)}</div>
        ) : (
          <p className="font-mono text-[11px] text-text-muted">
            No {activeTab} briefing available yet.
          </p>
        )}
      </div>
    </section>
  )
}
