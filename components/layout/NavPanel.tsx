// components/layout/NavPanel.tsx
'use client'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { SCOPES } from '@/lib/scopes'
import { ThemeToggle } from './ThemeToggle'
import { Menu, Rocket, Settings, X } from 'lucide-react'

interface NavPanelProps {
  isOpen: boolean
  setIsOpen: (b: boolean) => void
  onOpenSettings: () => void
}

export function NavPanel({ isOpen, setIsOpen, onOpenSettings }: NavPanelProps) {
  const params = useParams()
  const activeScope = params?.scope as string | undefined

  const toggle = () => setIsOpen(!isOpen)

  if (!isOpen) {
    return (
      <aside className="w-[56px] bg-[var(--surface)] border-r border-[var(--border)] shrink-0 flex flex-col items-center py-4">
        <button
          onClick={toggle}
          className="w-10 h-10 flex items-center justify-center rounded-[10px] text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors cursor-pointer"
          aria-label="Expand navigation"
        >
          <Menu size={20} />
        </button>

        <button
          onClick={onOpenSettings}
          className="w-10 h-10 mt-auto flex items-center justify-center rounded-[10px] text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors cursor-pointer"
          aria-label="Open settings"
        >
          <Settings size={18} />
        </button>
      </aside>
    )
  }

  return (
    <aside className="w-[280px] bg-[var(--surface)] border-r border-[var(--border)] shrink-0 flex flex-col">
      <div className="flex items-center justify-between px-6 pt-10 pb-6 shrink-0 bg-[var(--bg)]">
        <span className="text-[18px] font-bold text-[var(--text)] flex items-center gap-2">
          <Rocket size={20} />
          Stratum
        </span>
        <button
          onClick={toggle}
          className="w-8 h-8 flex items-center justify-center rounded-[8px] text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] transition-colors cursor-pointer"
          aria-label="Collapse navigation"
        >
          <X size={18} />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-6 px-5 bg-[var(--bg)]">
        <ul className="flex flex-col gap-2">
          {SCOPES.map((scope) => {
            const scopeIsActive = scope.id === activeScope
            return (
              <li key={scope.id}>
                <Link
                  href={`/${scope.id}`}
                  className={[
                    'flex items-center px-5 py-4 rounded-[10px] text-[15px] transition-all duration-200',
                    scopeIsActive
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

      <div className="shrink-0 px-5 py-5 border-t border-[var(--border-subtle)] bg-[var(--bg)] space-y-2">
        <button
          onClick={onOpenSettings}
          className="flex items-center gap-2 w-full px-3 py-2 rounded-[4px] text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] text-[11px] font-medium transition-colors cursor-pointer"
          aria-label="Open settings"
        >
          <Settings size={14} />
          <span>Settings</span>
        </button>
        <ThemeToggle />
      </div>
    </aside>
  )
}
