import type { NewsItem as NewsItemType } from '@/lib/types'
import { formatRelativeTime } from '@/lib/utils'
import { ExternalLink } from 'lucide-react'

export function NewsItem({ item }: { item: NewsItemType }) {
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-start justify-between gap-3 px-8 py-6 border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--surface-2)] transition-colors cursor-pointer group"
    >
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-medium text-[var(--text)] whitespace-normal break-words leading-snug mb-2 group-hover:text-[var(--accent)]">
          {item.title}
        </p>
        <p className="text-[12px] text-[var(--text-dim)]">
          {item.source}
          {item.category && (
            <>
              <span className="mx-1.5 text-[var(--text-muted)]">·</span>
              {item.category}
            </>
          )}
          <span className="mx-1.5 text-[var(--text-muted)]">·</span>
          {formatRelativeTime(item.publishedAt)}
        </p>
      </div>
      <span className="text-[var(--text-muted)] shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <ExternalLink size={14} />
      </span>
    </a>
  )
}
