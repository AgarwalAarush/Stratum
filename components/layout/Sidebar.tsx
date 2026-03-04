// components/layout/Sidebar.tsx
'use client'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { SCOPES } from '@/lib/scopes'
import { ThemeToggle } from './ThemeToggle'

export function Sidebar() {
  const params = useParams()
  const activeScope = params?.scope as string | undefined

  return (
    <aside
      className="hidden md:flex flex-col w-[220px] min-w-[220px] h-screen bg-[var(--surface)] border-r border-[var(--border)] sticky top-0 overflow-y-auto"
    >
      {/* Wordmark */}
      <div className="px-5 py-6 border-b border-[var(--border-subtle)]">
        <span className="text-[13px] font-bold tracking-[0.08em] uppercase text-[var(--text)]">
          Stratum
        </span>
      </div>

      {/* Scope list */}
      <nav className="flex-1 py-4 px-3">
        <ul className="flex flex-col gap-0.5">
          {SCOPES.map((scope) => {
            const isActive = scope.id === activeScope
            return (
              <li key={scope.id}>
                <Link
                  href={`/${scope.id}`}
                  className={[
                    'block px-3 py-2 rounded-[4px] text-[13px] transition-colors',
                    isActive
                      ? 'font-semibold text-[var(--text)] bg-[var(--surface-2)] border-l-2 border-[var(--accent)] pl-[10px]'
                      : 'font-medium text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]',
                  ].join(' ')}
                >
                  {scope.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Utilities */}
      <div className="px-3 py-4 border-t border-[var(--border-subtle)]">
        <ThemeToggle />
      </div>
    </aside>
  )
}
