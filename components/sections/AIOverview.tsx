'use client'

interface AIOverviewProps {
  bullets: string[]
  isLoading: boolean
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
                <span className="text-[13px] text-[var(--text)] leading-[1.5]">{bullet}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
