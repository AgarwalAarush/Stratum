// components/layout/NavPanel.tsx
'use client'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { SCOPES } from '@/lib/scopes'
import { ThemeToggle } from './ThemeToggle'
import { Menu, X } from 'lucide-react'

export function NavPanel({ isOpen, setIsOpen }: { isOpen: boolean, setIsOpen: (b: boolean) => void }) {
  const params = useParams()
  const activeScope = params?.scope as string | undefined

  const toggle = () => setIsOpen(!isOpen)

  return (
    <>
      {/* ─── Collapsed Side Bar (Always Visible when closed or on mobile maybe, but let's use a simpler approach) ─── */}
      {/* ─── Actually, we can just render the toggle button in the main layout header, or keep a thin strip ─── */}
      <div
        className="flex flex-col bg-[var(--surface-1)] border-r border-[var(--border)] transition-all duration-300 ease-in-out shrink-0"
        style={{
          width: isOpen ? '280px' : '0px',
          opacity: isOpen ? 1 : 0,
        }}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between px-6 h-[88px] border-b border-[var(--border)] shrink-0 bg-[var(--bg)]">
          <span className="text-[14px] font-bold tracking-[0.1em] uppercase text-[var(--text)]">
            Stratum
          </span>
          <button
            onClick={toggle}
            className="w-8 h-8 flex items-center justify-center rounded-[8px] text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] transition-colors cursor-pointer"
            aria-label="Close navigation"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scope list */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 bg-[var(--bg)]">
          <ul className="flex flex-col gap-1">
            {SCOPES.map((scope) => {
              const isActive = scope.id === activeScope
              return (
                <li key={scope.id}>
                  <Link
                    href={`/${scope.id}`}
                    className={[
                      'flex items-center px-4 py-3 rounded-[10px] text-[15px] transition-all duration-200',
                      isActive
                        ? 'bg-[var(--surface-2)] font-semibold text-[var(--text)] shadow-sm'
                        : 'font-medium text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]',
                    ].join(' ')}
                  >
                    {scope.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        {/* Bottom utilities */}
        <div className="shrink-0 px-3 py-4 border-t border-[var(--border-subtle)] bg-[var(--bg)]">
          <ThemeToggle />
        </div>
      </div>

      {/* Persistent Toggle Button when closed */}
      {!isOpen && (
        <div className="absolute top-4 left-4 z-50">
          <button
            onClick={toggle}
            className="w-10 h-10 flex items-center justify-center rounded-[10px] bg-[var(--surface-1)] border border-[var(--border-subtle)] backdrop-blur-md shadow-sm text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-all cursor-pointer"
            aria-label="Open navigation"
          >
            <Menu size={20} />
          </button>
        </div>
      )}
    </>
  )
}
