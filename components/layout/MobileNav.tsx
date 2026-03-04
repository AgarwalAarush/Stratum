// components/layout/MobileNav.tsx
'use client'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { SCOPES } from '@/lib/scopes'

export function MobileNav() {
  const params = useParams()
  const activeScope = params?.scope as string | undefined

  return (
    <nav className="md:hidden sticky top-0 z-10 bg-[var(--surface)] border-b border-[var(--border)]">
      {/* Wordmark */}
      <div className="px-4 py-3 border-b border-[var(--border-subtle)]">
        <span className="text-[13px] font-bold tracking-[0.08em] uppercase text-[var(--text)]">
          Stratum
        </span>
      </div>
      {/* Horizontal scroll for scopes */}
      <div className="flex overflow-x-auto gap-1 px-3 py-2 scrollbar-none">
        {SCOPES.map((scope) => {
          const isActive = scope.id === activeScope
          return (
            <Link
              key={scope.id}
              href={`/${scope.id}`}
              className={[
                'shrink-0 px-3 py-1.5 rounded-[4px] text-[11px] font-semibold whitespace-nowrap transition-colors',
                isActive
                  ? 'bg-[var(--accent)] text-[var(--bg)]'
                  : 'text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]',
              ].join(' ')}
            >
              {scope.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
