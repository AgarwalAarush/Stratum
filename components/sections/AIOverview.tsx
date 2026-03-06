'use client'

import type { ReactNode } from 'react'

interface AIOverviewProps {
  bullets: string[]
  isLoading: boolean
}

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
        className="inline-block font-mono text-[10px] bg-black/8 dark:bg-white/10 rounded px-1 py-px hover:bg-black/15 dark:hover:bg-white/20 transition-colors relative -top-0.5 no-underline text-[var(--text-dim)]"
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

export function AIOverview({ bullets, isLoading }: AIOverviewProps) {
  return (
    <section className="border-b border-black/10 flex flex-col">
      <header className="w-full h-[var(--section-header-height)] shrink-0 flex items-center justify-between px-6 py-2 border-b border-black/10">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.15em] text-black/70">
            AI Overview
          </span>
          {!isLoading && (
            <span className="font-mono text-[10px] text-black/30 tracking-[0.05em]">
              {bullets.length}
            </span>
          )}
        </div>
        <span className="font-mono text-[10px] text-black/25 tracking-[0.05em]">
          claude-powered
        </span>
      </header>

      <div className="px-6 py-4">
        {isLoading ? (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-x-8 gap-y-2.5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-4 rounded bg-black/8 animate-pulse"
                style={{ width: `${65 + (i % 3) * 12}%` }}
              />
            ))}
          </div>
        ) : bullets.length === 0 ? (
          <p className="font-mono text-[11px] text-black/40">
            No overview available.
          </p>
        ) : (
          <ul className="grid grid-cols-1 xl:grid-cols-2 gap-x-8 gap-y-2">
            {bullets.map((bullet, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="font-mono text-[12px] text-black/30 shrink-0 mt-0.5">→</span>
                <span className="text-[13px] text-[var(--text)] leading-[1.5]">
                  {parseBulletWithCitations(bullet)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
