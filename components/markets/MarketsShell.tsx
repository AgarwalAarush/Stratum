'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ArrowClockwise, List, Moon, Sun, X } from '@phosphor-icons/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { StockSearch } from './StockSearch'
import { useThemeStore } from '@/store/theme'

const MARKET_NAV_ITEMS = [
  { href: '/markets', label: 'Overview' },
  { href: '/markets/world', label: 'World' },
  { href: '/markets/review', label: 'Review' },
  { href: '/markets/biotech', label: 'Biotech' },
  { href: '/markets/candidates', label: 'Candidates' },
  { href: '/markets/explore', label: 'Explore' },
  { href: '/markets/portfolio', label: 'Portfolio' },
  { href: '/markets/recommendations', label: 'Decisions' },
  { href: '/markets/theses', label: 'Theses' },
  { href: '/markets/research', label: 'Research' },
  { href: '/markets/events', label: 'Events' },
] as const

function isActivePath(pathname: string, href: string): boolean {
  if (href === '/markets') return pathname === href
  return pathname.startsWith(href)
}

function formatMarketTime(value?: string): string {
  if (!value) return '4:00 PM ET'
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(value))
}

interface MarketStatusResponse {
  dataAsOf?: string
}

export function MarketsShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [refreshing, setRefreshing] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [dataAsOf, setDataAsOf] = useState<string>()
  const prefetchedRoutes = useRef(new Set<string>())
  const { theme, setTheme, toggle: toggleTheme } = useThemeStore()

  useEffect(() => {
    const saved = localStorage.getItem('stratum-theme') as 'dark' | 'light' | null
    if (saved && saved !== theme) setTheme(saved)
  }, [setTheme, theme])

  useEffect(() => {
    const controller = new AbortController()
    void fetch('/api/markets/status', { signal: controller.signal })
      .then(async (response) => response.ok ? await response.json() as MarketStatusResponse : null)
      .then((status) => {
        if (status?.dataAsOf) setDataAsOf(status.dataAsOf)
      })
      .catch(() => {})
    return () => controller.abort()
  }, [])

  const prefetchRoute = useCallback((href: string) => {
    if (prefetchedRoutes.current.has(href)) return
    prefetchedRoutes.current.add(href)
    router.prefetch(href)
  }, [router])

  const refresh = () => {
    setRefreshing(true)
    router.refresh()
    window.setTimeout(() => setRefreshing(false), 650)
  }

  return (
    <div className="markets-shell min-h-[100dvh] bg-[var(--market-bg)] text-[var(--market-text)]">
      <header className="markets-header">
        <Link
          href="/markets"
          prefetch={false}
          className="markets-wordmark"
          aria-label="Stratum Markets home"
          onMouseEnter={() => prefetchRoute('/markets')}
          onFocus={() => prefetchRoute('/markets')}
        >
          STRATUM
        </Link>

        <nav className="markets-mode-switch" aria-label="Product mode">
          <Link
            href="/ai-research"
            prefetch={false}
            className="markets-mode-link"
            onMouseEnter={() => prefetchRoute('/ai-research')}
            onFocus={() => prefetchRoute('/ai-research')}
          >
            Intelligence
          </Link>
          <span aria-hidden="true" className="markets-mode-divider" />
          <Link
            href="/markets"
            prefetch={false}
            className="markets-mode-link markets-mode-link-active"
            aria-current="page"
            onMouseEnter={() => prefetchRoute('/markets')}
            onFocus={() => prefetchRoute('/markets')}
          >
            Markets
          </Link>
        </nav>

        <div className="markets-status">
          <StockSearch />
          <button
            type="button"
            className="markets-icon-button"
            aria-label="Refresh market data"
            onClick={refresh}
          >
            <ArrowClockwise size={17} weight="regular" className={refreshing ? 'markets-refreshing' : ''} />
          </button>
          <button
            type="button"
            className="markets-icon-button"
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            onClick={toggleTheme}
          >
            {theme === 'dark' ? <Sun size={17} weight="regular" /> : <Moon size={17} weight="regular" />}
          </button>
          <span className="markets-status-dot" aria-hidden="true" />
          <Link
            href="/markets/system"
            prefetch={false}
            className="markets-status-copy"
            onMouseEnter={() => prefetchRoute('/markets/system')}
            onFocus={() => prefetchRoute('/markets/system')}
          >
            {dataAsOf ? `Updated ${formatMarketTime(dataAsOf)}` : 'Loading market status…'}
          </Link>
          <button
            type="button"
            className="markets-mobile-menu-button"
            onClick={() => setMobileNavOpen((value) => !value)}
            aria-expanded={mobileNavOpen}
            aria-controls="markets-navigation"
            aria-label={mobileNavOpen ? 'Close Markets navigation' : 'Open Markets navigation'}
          >
            {mobileNavOpen ? <X size={18} /> : <List size={19} />}
          </button>
        </div>
      </header>

      <nav
        id="markets-navigation"
        aria-label="Markets"
        className={`markets-subnav ${mobileNavOpen ? 'markets-subnav-open' : ''}`}
      >
        {MARKET_NAV_ITEMS.map((item) => {
          const active = isActivePath(pathname, item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={false}
              aria-current={active ? 'page' : undefined}
              className={`markets-subnav-link ${active ? 'markets-subnav-link-active' : ''}`}
              onMouseEnter={() => prefetchRoute(item.href)}
              onFocus={() => prefetchRoute(item.href)}
              onClick={() => setMobileNavOpen(false)}
            >
              {item.label}
            </Link>
          )
        })}
      </nav>

      <main className="markets-main">{children}</main>
    </div>
  )
}
