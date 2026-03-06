// components/layout/NavPanel.tsx
'use client'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { SCOPES } from '@/lib/scopes'
import { ThemeToggle } from './ThemeToggle'
import { Layers, Menu, Settings } from 'lucide-react'

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
      <aside className="w-[56px] bg-[var(--surface)] border-r border-[var(--border)] shrink-0 flex flex-col items-center py-3">
        <button
          onClick={toggle}
          className="w-10 h-10 flex items-center justify-center rounded-[8px] text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors cursor-pointer"
          aria-label="Expand navigation"
        >
          <Menu size={16} />
        </button>

        <button
          onClick={onOpenSettings}
          className="w-10 h-10 mt-auto flex items-center justify-center rounded-[8px] text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors cursor-pointer"
          aria-label="Open settings"
        >
          <Settings size={15} />
        </button>
        <ThemeToggle compact />
      </aside>
    )
  }

  return (
    <aside className="w-[188px] bg-[var(--surface)] border-r border-[var(--border)] shrink-0 flex flex-col">
      <div className="flex items-center gap-2 px-4 py-4 border-b border-[var(--border)] shrink-0">
        <button
          onClick={toggle}
          className="w-7 h-7 flex items-center justify-center rounded-[6px] text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] transition-colors cursor-pointer"
          aria-label="Collapse navigation"
        >
          <Menu size={15} />
        </button>
        <span className="text-[13px] font-semibold text-[var(--text)] tracking-[0.12em] uppercase font-mono flex items-center gap-2">
          <Layers size={14} strokeWidth={1.5} />
          Stratum
        </span>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-3">
        <p className="px-2 pb-2 text-[9px] uppercase tracking-[0.14em] text-[var(--text-muted)] font-mono">
          Scopes
        </p>
        <ul className="flex flex-col gap-0.5">
          {SCOPES.map((scope) => {
            const scopeIsActive = scope.id === activeScope
            return (
              <li key={scope.id}>
                <Link
                  href={`/${scope.id}`}
                  className={[
                    'flex items-center gap-2 px-2 py-1.5 rounded-[3px] text-[12px] transition-colors duration-150 font-mono',
                    scopeIsActive
                      ? 'bg-[var(--surface-2)] font-medium text-[var(--text)]'
                      : 'font-normal text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]',
                  ].join(' ')}
                >
                  <span className="w-[5px] h-[5px] rounded-full bg-current opacity-50 shrink-0" />
                  {scope.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      <div className="shrink-0 px-3 py-3 border-t border-[var(--border-subtle)] space-y-1.5">
        <button
          onClick={onOpenSettings}
          className="flex items-center gap-2 w-full px-2 py-2 rounded-[3px] text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] text-[10px] font-medium font-mono uppercase tracking-[0.08em] transition-colors cursor-pointer"
          aria-label="Open settings"
        >
          <Settings size={12} />
          <span>Settings</span>
        </button>
        <ThemeToggle />
      </div>
    </aside>
  )
}
