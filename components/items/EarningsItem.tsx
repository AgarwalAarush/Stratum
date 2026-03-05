// components/items/EarningsItem.tsx
import type { EarningsItem as EarningsItemType } from '@/lib/types'
import { formatRelativeTime, formatFutureTime } from '@/lib/utils'

export function EarningsItem({ item }: { item: EarningsItemType }) {
  const isUpcoming = item.beat === undefined
  const beat = item.beat

  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-start justify-between gap-3 px-5 py-4 border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--surface-2)] transition-colors cursor-pointer group"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[14px] font-semibold text-[var(--text)] group-hover:text-[var(--accent)]">{item.ticker}</span>
          <span className="text-[14px] font-normal text-[var(--text-dim)] truncate">{item.companyName}</span>
          {!isUpcoming && (
            <span
              className={`text-[12px] font-semibold ml-auto ${beat ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}
            >
              {beat ? 'Beat ↑' : 'Miss ↓'}
            </span>
          )}
        </div>
        <p className="text-[12px] text-[var(--text-dim)]">
          {item.quarter}
          {item.epsActual !== undefined && (
            <>
              <span className="mx-1.5 text-[var(--text-muted)]">·</span>
              EPS: ${item.epsActual.toFixed(2)} vs ${item.epsEstimate?.toFixed(2)} est
            </>
          )}
          {isUpcoming && (
            <>
              <span className="mx-1.5 text-[var(--text-muted)]">·</span>
              Reports {formatFutureTime(item.reportDate)}
            </>
          )}
          {!isUpcoming && item.epsActual === undefined && (
            <>
              <span className="mx-1.5 text-[var(--text-muted)]">·</span>
              {formatRelativeTime(item.reportDate)}
            </>
          )}
        </p>
      </div>
      <span className="text-[12px] text-[var(--text-muted)] shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        ↗
      </span>
    </a>
  )
}
