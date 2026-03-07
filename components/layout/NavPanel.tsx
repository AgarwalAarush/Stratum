// components/layout/NavPanel.tsx
'use client'
import Link from 'next/link'
import { useParams, usePathname } from 'next/navigation'
import { SCOPES } from '@/lib/scopes'
import { ThemeToggle } from './ThemeToggle'
import Image from 'next/image'
import { Menu, Settings } from 'lucide-react'

const NAV_ABBR: Record<string, string> = {
  'morning-brief': 'MB',
  'ai-research': 'AI',
  'finance': 'FI',
}

interface NavPanelProps {
  isOpen: boolean
  setIsOpen: (b: boolean) => void
  onOpenSettings: () => void
}

export function NavPanel({ isOpen, setIsOpen, onOpenSettings }: NavPanelProps) {
  const params = useParams()
  const pathname = usePathname()
  const activeScope = params?.scope as string | undefined
  const isMorningBrief = pathname === '/morning-brief'

  const toggle = () => setIsOpen(!isOpen)

  return (
    <aside
      className="bg-[var(--surface)] border-r border-[var(--border)] shrink-0 flex flex-col overflow-hidden"
      style={{
        width: isOpen ? 'var(--sidebar-open-width)' : 'var(--sidebar-collapsed-width)',
        transitionProperty: 'width',
        transitionDuration: 'var(--sidebar-motion-duration)',
        transitionTimingFunction: 'var(--sidebar-motion-easing)',
      }}
    >
      <div className="h-[var(--top-header-height)] border-b border-[var(--border)] shrink-0 relative flex items-center">
        <button
          onClick={toggle}
          className="cursor-pointer shrink-0 absolute"
          style={{ left: 'calc(var(--sidebar-collapsed-width) / 2 - 10px)' }}
          aria-label={isOpen ? 'Collapse navigation' : 'Expand navigation'}
        >
          <Image src="/icon.png" alt="Stratum" width={20} height={20} className="rounded-[4px]" />
        </button>
        {isOpen && (
          <button
            onClick={toggle}
            className="w-7 h-7 flex items-center justify-center rounded-[6px] text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] transition-colors cursor-pointer shrink-0 absolute right-3"
            aria-label="Collapse navigation"
          >
            <Menu size={15} />
          </button>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-3">
        <Link
          href="/morning-brief"
          aria-label="Morning Brief"
          title={!isOpen ? 'Morning Brief' : undefined}
          className={[
            'flex items-center rounded-[3px] text-[12px] transition-colors duration-150 font-mono mb-3',
            isOpen ? 'gap-2 px-2 py-1.5 justify-start' : 'h-8 px-0 justify-center',
            isMorningBrief
              ? 'bg-[var(--surface-2)] font-medium text-[var(--text)]'
              : 'font-normal text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]',
          ].join(' ')}
        >
          {isOpen ? (
            <>
              <span className="w-[5px] h-[5px] rounded-full bg-current opacity-50 shrink-0" />
              <span
                className="whitespace-nowrap"
                style={{
                  opacity: isOpen ? 1 : 0,
                  transform: isOpen ? 'translateX(0)' : 'translateX(-6px)',
                  pointerEvents: isOpen ? 'auto' : 'none',
                  transitionProperty: 'opacity, transform',
                  transitionDuration: 'var(--sidebar-motion-duration)',
                  transitionTimingFunction: 'var(--sidebar-motion-easing)',
                }}
              >
                Morning Brief
              </span>
            </>
          ) : (
            <span className="text-[10px] font-mono font-medium">{NAV_ABBR['morning-brief']}</span>
          )}
        </Link>
        <p
          className="px-2 pb-2 text-[9px] uppercase tracking-[0.14em] text-[var(--text-muted)] font-mono whitespace-nowrap"
          style={{
            opacity: isOpen ? 1 : 0,
            transform: isOpen ? 'translateX(0)' : 'translateX(-6px)',
            pointerEvents: isOpen ? 'auto' : 'none',
            transitionProperty: 'opacity, transform',
            transitionDuration: 'var(--sidebar-motion-duration)',
            transitionTimingFunction: 'var(--sidebar-motion-easing)',
          }}
          aria-hidden={!isOpen}
        >
          Scopes
        </p>
        <ul className="flex flex-col gap-0.5">
          {SCOPES.map((scope) => {
            const scopeIsActive = scope.id === activeScope
            return (
              <li key={scope.id}>
                <Link
                  href={`/${scope.id}`}
                  aria-label={scope.label}
                  title={!isOpen ? scope.label : undefined}
                  className={[
                    'flex items-center rounded-[3px] text-[12px] transition-colors duration-150 font-mono',
                    isOpen ? 'gap-2 px-2 py-1.5 justify-start' : 'h-8 px-0 justify-center',
                    scopeIsActive
                      ? 'bg-[var(--surface-2)] font-medium text-[var(--text)]'
                      : 'font-normal text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]',
                  ].join(' ')}
                >
                  {isOpen ? (
                    <>
                      <span className="w-[5px] h-[5px] rounded-full bg-current opacity-50 shrink-0" />
                      <span
                        className="whitespace-nowrap"
                        style={{
                          opacity: isOpen ? 1 : 0,
                          transform: isOpen ? 'translateX(0)' : 'translateX(-6px)',
                          pointerEvents: isOpen ? 'auto' : 'none',
                          transitionProperty: 'opacity, transform',
                          transitionDuration: 'var(--sidebar-motion-duration)',
                          transitionTimingFunction: 'var(--sidebar-motion-easing)',
                        }}
                      >
                        {scope.label}
                      </span>
                    </>
                  ) : (
                    <span className="text-[10px] font-mono font-medium">{NAV_ABBR[scope.id] ?? scope.id.slice(0, 2).toUpperCase()}</span>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      <div className="shrink-0 px-3 py-3 border-t border-[var(--border-subtle)] space-y-1.5">
        <button
          onClick={onOpenSettings}
          className={[
            'flex items-center rounded-[3px] text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors cursor-pointer',
            isOpen
              ? 'gap-2 w-full px-2 py-2 text-[10px] font-medium font-mono uppercase tracking-[0.08em] justify-start'
              : 'w-10 h-10 justify-center mx-auto',
          ].join(' ')}
          aria-label="Open settings"
          title={!isOpen ? 'Settings' : undefined}
        >
          <Settings size={12} />
          <span
            style={{
              opacity: isOpen ? 1 : 0,
              transform: isOpen ? 'translateX(0)' : 'translateX(-6px)',
              pointerEvents: isOpen ? 'auto' : 'none',
              transitionProperty: 'opacity, transform',
              transitionDuration: 'var(--sidebar-motion-duration)',
              transitionTimingFunction: 'var(--sidebar-motion-easing)',
            }}
            aria-hidden={!isOpen}
          >
            Settings
          </span>
        </button>
        <ThemeToggle compact={!isOpen} />
      </div>
    </aside>
  )
}
