import type { ReactNode } from 'react'

export const CITATION_RE = /\[(\d+)\]\((https?:\/\/[^\s)]+)\)/g

export function parseBulletWithCitations(bullet: string): ReactNode {
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
