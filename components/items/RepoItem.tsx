// components/items/RepoItem.tsx
import type { RepoItem as RepoItemType } from '@/lib/types'

export function RepoItem({ item }: { item: RepoItemType }) {
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-start justify-between gap-3 px-5 py-4 border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--surface-2)] transition-colors cursor-pointer group"
    >
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-medium text-[var(--text)] truncate leading-snug mb-1 group-hover:text-[var(--accent)]">
          <span className="text-[var(--text-dim)] font-normal">{item.owner}/</span>
          {item.name}
        </p>
        <p className="text-[12px] text-[var(--text-dim)] truncate mb-0.5">{item.description}</p>
        <p className="text-[12px] text-[var(--text-dim)]">
          {item.language}
          <span className="mx-1.5 text-[var(--text-muted)]">·</span>
          ★ {item.starsToday.toLocaleString()} today
          <span className="mx-1.5 text-[var(--text-muted)]">·</span>
          {item.totalStars.toLocaleString()} total
        </p>
      </div>
      <span className="text-[12px] text-[var(--text-muted)] shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        ↗
      </span>
    </a>
  )
}
