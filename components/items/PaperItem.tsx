// components/items/PaperItem.tsx
import type { PaperItem as PaperItemType } from '@/lib/types'
import { formatRelativeTime } from '@/lib/utils'

export function PaperItem({ item }: { item: PaperItemType }) {
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-start justify-between gap-3 px-4 py-3 border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--surface-2)] transition-colors cursor-pointer group"
    >
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-[var(--text)] truncate leading-snug mb-1 group-hover:text-[var(--accent)]">
          {item.title}
        </p>
        <p className="text-[11px] text-[var(--text-dim)]">
          {item.authors.join(', ')}
          {item.categories.length > 0 && (
            <>
              <span className="mx-1.5 text-[var(--text-muted)]">·</span>
              {item.categories.join(', ')}
            </>
          )}
          <span className="mx-1.5 text-[var(--text-muted)]">·</span>
          {formatRelativeTime(item.publishedAt)}
        </p>
      </div>
      <span className="text-[11px] text-[var(--text-muted)] shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        ↗
      </span>
    </a>
  )
}
