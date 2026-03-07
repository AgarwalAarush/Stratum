'use client'

import { useEffect, useState } from 'react'
import useSWR from 'swr'
import { X } from 'lucide-react'
import { parseBulletWithCitations } from '@/lib/citations'
import type { MorningBriefData } from '@/lib/types'

async function fetcher(url: string) {
  const res = await fetch(url)
  if (!res.ok) throw new Error('Failed to fetch morning brief')
  return res.json() as Promise<MorningBriefData>
}

function getTodayDate() {
  return new Date().toISOString().slice(0, 10)
}

const STORAGE_KEY = 'stratum:morning-brief-seen'

export function MorningBriefModal() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const seen = localStorage.getItem(STORAGE_KEY)
    if (seen !== getTodayDate()) {
      setShow(true)
    }
  }, [])

  const { data, isLoading } = useSWR(show ? '/api/morning-brief' : null, fetcher, {
    revalidateOnFocus: false,
  })

  useEffect(() => {
    if (!show) return
    // Auto-close if data loaded but empty
    if (!isLoading && data && data.sections.length === 0) {
      setShow(false)
      return
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismiss()
    }
    window.addEventListener('keydown', onKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [show, isLoading, data])

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, getTodayDate())
    setShow(false)
  }

  if (!show) return null

  const hasContent = data && data.sections.length > 0
  const briefDate = data?.generatedAt
    ? new Date(data.generatedAt).toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      })
    : getTodayDate()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-8">
      <button
        onClick={dismiss}
        className="absolute inset-0 bg-black/35 cursor-default"
        aria-label="Close morning brief"
      />

      <div className="relative w-full max-w-[850px] h-[min(750px,90vh)] bg-[var(--bg)] border border-[var(--border)] rounded-[20px] shadow-xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-5 border-b border-[var(--border)] shrink-0">
          <div>
            <h2 className="text-[18px] font-bold text-[var(--text)]">Morning Brief</h2>
            <p className="text-[12px] text-[var(--text-muted)] mt-0.5 font-mono">{briefDate}</p>
          </div>
          <button
            onClick={dismiss}
            className="w-9 h-9 rounded-[10px] flex items-center justify-center text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors cursor-pointer"
            aria-label="Close morning brief modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto main-scroll px-8 py-6">
          {isLoading ? (
            <div className="space-y-6 max-w-3xl">
              <div className="h-5 rounded bg-black/8 animate-pulse w-3/4" />
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <div className="h-3 rounded bg-black/8 animate-pulse w-1/4" />
                  {Array.from({ length: 3 }).map((_, j) => (
                    <div
                      key={j}
                      className="h-4 rounded bg-black/8 animate-pulse"
                      style={{ width: `${60 + (j % 3) * 12}%` }}
                    />
                  ))}
                </div>
              ))}
            </div>
          ) : hasContent ? (
            <div className="max-w-3xl">
              {/* Stale indicator */}
              {data.stale && (
                <div className="mb-4 px-3 py-1.5 rounded bg-black/5 dark:bg-white/5">
                  <span className="font-mono text-[10px] text-[var(--text-muted)]">
                    Showing yesterday&apos;s brief
                  </span>
                </div>
              )}

              {/* Headline */}
              <p className="text-[15px] font-medium text-[var(--text)] leading-[1.5] mb-5">
                {parseBulletWithCitations(data.headline)}
              </p>

              {/* Sections */}
              <div className="space-y-5">
                {data.sections.map((section, i) => (
                  <div key={i}>
                    <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-black/60 mb-2">
                      {section.title}
                    </h3>
                    <ul className="space-y-1.5">
                      {section.bullets.map((bullet, j) => (
                        <li key={j} className="flex items-start gap-2">
                          <span className="font-mono text-[12px] text-black/30 shrink-0 mt-0.5">→</span>
                          <span className="text-[13px] text-[var(--text)] leading-[1.5]">
                            {parseBulletWithCitations(bullet)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>

              {/* What to Watch */}
              {data.watchList.length > 0 && (
                <div className="mt-6 pt-4 border-t border-black/10">
                  <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-black/60 mb-2">
                    What to Watch
                  </h3>
                  <ul className="space-y-1.5">
                    {data.watchList.map((item, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="font-mono text-[12px] text-black/30 shrink-0 mt-0.5">→</span>
                        <span className="text-[13px] text-[var(--text)] leading-[1.5]">
                          {parseBulletWithCitations(item)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
