'use client'

import type { ReactNode } from 'react'
import useSWR from 'swr'
import type { MorningBriefData } from '@/lib/types'

const CITATION_RE = /\[(\d+)\]\((https?:\/\/[^\s)]+)\)/g

function parseBulletWithCitations(bullet: string): ReactNode {
  const parts: ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  CITATION_RE.lastIndex = 0
  while ((match = CITATION_RE.exec(bullet)) !== null) {
    if (match.index > lastIndex) {
      parts.push(bullet.slice(lastIndex, match.index))
    }
    const num = match[1]
    const url = match[2]
    parts.push(
      <a
        key={`${num}-${match.index}`}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center justify-center font-mono text-[9px] min-w-[16px] h-[16px] bg-black/8 dark:bg-white/10 rounded-full px-1 hover:bg-black/15 dark:hover:bg-white/20 transition-colors relative -top-0.5 no-underline text-[var(--text-dim)] leading-none"
      >
        {num}
      </a>,
    )
    lastIndex = match.index + match[0].length
  }

  if (parts.length === 0) return bullet

  if (lastIndex < bullet.length) {
    parts.push(bullet.slice(lastIndex))
  }

  return <>{parts}</>
}

async function fetcher(url: string) {
  const res = await fetch(url)
  if (!res.ok) throw new Error('Failed to fetch morning brief')
  return res.json() as Promise<MorningBriefData>
}

export function MorningBriefFeed() {
  const { data, isLoading } = useSWR('/api/morning-brief', fetcher, {
    refreshInterval: 3_600_000,
    revalidateOnFocus: false,
  })

  const hasContent = data && data.sections.length > 0

  return (
    <div className="h-full overflow-y-auto">
      <section className="flex flex-col">
        {/* Header */}
        <header className="w-full h-[var(--section-header-height)] shrink-0 flex items-center justify-between px-6 py-2 border-b border-black/10">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.15em] text-black/70">
              Morning Brief
            </span>
          </div>
          {hasContent && (
            <span className="font-mono text-[10px] text-black/25 tracking-[0.05em]">
              {data.generatedAt
                ? `Generated ${new Date(data.generatedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
                : ''}
              {data.itemCount > 0 ? ` · ${data.itemCount} signals` : ''}
            </span>
          )}
        </header>

        <div className="px-6 py-4 max-w-3xl">
          {isLoading ? (
            <div className="space-y-6">
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
          ) : !hasContent ? (
            <p className="font-mono text-[11px] text-black/40">
              No morning brief available yet.
            </p>
          ) : (
            <>
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
            </>
          )}
        </div>
      </section>
    </div>
  )
}
