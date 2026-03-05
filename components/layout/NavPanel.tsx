// components/layout/NavPanel.tsx
'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { SCOPES } from '@/lib/scopes'
import { ThemeToggle } from './ThemeToggle'

export function NavPanel() {
  const [isOpen, setIsOpen] = useState(false)
  const params = useParams()
  const activeScope = params?.scope as string | undefined

  const close = () => setIsOpen(false)

  return (
    <>
      {/* ─── Top bar (always visible) ─── */}
      <header className="sticky top-0 z-40 h-[52px] flex items-center gap-4 px-5 bg-[var(--bg)] border-b border-[var(--border-subtle)]">
        <button
          onClick={() => setIsOpen(true)}
          className="flex flex-col gap-[5px] p-2 -ml-2 rounded-[6px] hover:bg-[var(--surface-2)] transition-colors cursor-pointer"
          aria-label="Open navigation"
        >
          <span className="block w-[18px] h-[1.5px] bg-[var(--text-dim)] rounded-full" />
          <span className="block w-[18px] h-[1.5px] bg-[var(--text-dim)] rounded-full" />
          <span className="block w-[18px] h-[1.5px] bg-[var(--text-dim)] rounded-full" />
        </button>
        <span className="text-[13px] font-bold tracking-[0.1em] uppercase text-[var(--text)]">
          Stratum
        </span>
      </header>

      {/* ─── Backdrop ─── */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-40"
          onClick={close}
          aria-hidden="true"
        />
      )}

      {/* ─── Slide-in drawer ─── */}
      <div
        className="fixed left-0 top-0 bottom-0 w-[280px] z-50 flex flex-col bg-[var(--bg)] shadow-2xl"
        style={{
          transform: isOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.25s ease',
        }}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between px-5 h-[52px] border-b border-[var(--border-subtle)] shrink-0">
          <span className="text-[13px] font-bold tracking-[0.1em] uppercase text-[var(--text)]">
            Stratum
          </span>
          <button
            onClick={close}
            className="w-8 h-8 flex items-center justify-center rounded-[6px] text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] transition-colors cursor-pointer text-[18px]"
            aria-label="Close navigation"
          >
            ×
          </button>
        </div>

        {/* Scope list */}
        <nav className="flex-1 overflow-y-auto py-3 px-2">
          <ul className="flex flex-col gap-0.5">
            {SCOPES.map((scope) => {
              const isActive = scope.id === activeScope
              return (
                <li key={scope.id}>
                  <Link
                    href={`/${scope.id}`}
                    onClick={close}
                    className={[
                      'flex items-center px-4 py-3 rounded-xl text-[15px] transition-colors',
                      isActive
                        ? 'bg-[var(--surface-2)] font-semibold text-[var(--text)]'
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
        <div className="shrink-0 px-2 py-3 border-t border-[var(--border-subtle)]">
          <ThemeToggle />
        </div>
      </div>
    </>
  )
}
