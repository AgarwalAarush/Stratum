'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import ReactMarkdown from 'react-markdown'
import { X } from 'lucide-react'
import type { PeriodicOverviewData } from '@/lib/types'

interface IntelligenceBriefingsModalProps {
  open: boolean
  onClose: () => void
}

async function fetchOverview(url: string) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Failed to fetch ${url}`)
  return response.json() as Promise<PeriodicOverviewData>
}

function formatDateRange(start: string, end: string): string {
  if (!start || !end) return ''

  const format = (dateString: string) => {
    const date = new Date(`${dateString}T00:00:00`)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  return `${format(start)} – ${format(end)}`
}

export function IntelligenceBriefingsModal({ open, onClose }: IntelligenceBriefingsModalProps) {
  const [activeTab, setActiveTab] = useState<'weekly' | 'monthly'>('weekly')

  const closeModal = useCallback(() => {
    setActiveTab('weekly')
    onClose()
  }, [onClose])

  const { data: weeklyData, isLoading: weeklyLoading } = useSWR<PeriodicOverviewData>(
    open ? '/api/overviews/weekly' : null,
    fetchOverview,
    { revalidateOnFocus: false },
  )

  const { data: monthlyData, isLoading: monthlyLoading } = useSWR<PeriodicOverviewData>(
    open ? '/api/overviews/monthly' : null,
    fetchOverview,
    { revalidateOnFocus: false },
  )

  useEffect(() => {
    if (!open) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeModal()
    }

    window.addEventListener('keydown', onKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [closeModal, open])

  const activeBriefing = activeTab === 'weekly' ? weeklyData : monthlyData
  const isLoading = weeklyLoading || monthlyLoading

  const periodLabel = useMemo(() => {
    if (!activeBriefing?.periodStart || !activeBriefing?.periodEnd) return ''
    return formatDateRange(activeBriefing.periodStart, activeBriefing.periodEnd)
  }, [activeBriefing])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-8">
      <button
        onClick={closeModal}
        className="absolute inset-0 bg-black/35 cursor-default"
        aria-label="Close weekly briefs"
      />

      <div className="relative w-full max-w-[850px] h-[min(750px,90vh)] bg-[var(--bg)] border border-[var(--border)] shadow-xl overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-8 py-5 border-b border-[var(--border)] shrink-0 gap-4">
          <div className="min-w-0">
            <h2 className="text-[18px] font-bold text-[var(--text)]">Weekly Briefs</h2>
            <div className="mt-2 flex items-center gap-2">
              <button
                onClick={() => setActiveTab('weekly')}
                className={`font-mono text-[10px] px-2.5 py-1 rounded transition-colors cursor-pointer ${
                  activeTab === 'weekly'
                    ? 'bg-surface-2 text-text-dim'
                    : 'text-text-muted hover:text-text-dim hover:bg-[var(--surface-2)]'
                }`}
              >
                Weekly
              </button>
              <button
                onClick={() => setActiveTab('monthly')}
                className={`font-mono text-[10px] px-2.5 py-1 rounded transition-colors cursor-pointer ${
                  activeTab === 'monthly'
                    ? 'bg-surface-2 text-text-dim'
                    : 'text-text-muted hover:text-text-dim hover:bg-[var(--surface-2)]'
                }`}
              >
                Biweekly
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {periodLabel && (
              <span className="font-mono text-[10px] text-text-muted tracking-[0.05em]">
                {periodLabel}
              </span>
            )}
            <button
              onClick={closeModal}
              className="w-9 h-9 rounded-[10px] flex items-center justify-center text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors cursor-pointer"
              aria-label="Close weekly briefs modal"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto main-scroll px-8 py-6">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div
                  key={index}
                  className="h-4 rounded bg-surface-2 animate-pulse"
                  style={{ width: `${58 + (index % 4) * 10}%` }}
                />
              ))}
            </div>
          ) : activeBriefing?.content ? (
            <div className="briefing-markdown text-[13px] text-[var(--text)] leading-[1.6]">
              <ReactMarkdown>{activeBriefing.content}</ReactMarkdown>
            </div>
          ) : (
            <p className="font-mono text-[11px] text-text-muted">
              No {activeTab === 'weekly' ? 'weekly' : 'biweekly'} briefing available yet.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
