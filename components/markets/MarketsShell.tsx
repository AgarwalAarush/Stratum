'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ArrowClockwise, List, X } from '@phosphor-icons/react'
import { useState } from 'react'

const MARKET_NAV_ITEMS = [
  { href: '/markets', label: 'Overview' },
  { href: '/markets/screener', label: 'Screener' },
  { href: '/markets/macro', label: 'Macro' },
  { href: '/markets/news', label: 'News' },
  { href: '/markets/research', label: 'Research' },
  { href: '/markets/watchlists', label: 'Watchlists' },
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

export function MarketsShell({ children, dataAsOf }: { children: React.ReactNode; dataAsOf?: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const [refreshing, setRefreshing] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  const refresh = () => {
    setRefreshing(true)
    router.refresh()
    window.setTimeout(() => setRefreshing(false), 650)
  }

  return (
    <div className="markets-shell min-h-[100dvh] bg-[var(--market-bg)] text-[var(--market-text)]">
      <header className="markets-header">
        <Link href="/markets" className="markets-wordmark" aria-label="Stratum Markets home">
          STRATUM
        </Link>

        <nav className="markets-mode-switch" aria-label="Product mode">
          <Link href="/ai-research" className="markets-mode-link">
            Intelligence
          </Link>
          <span aria-hidden="true" className="markets-mode-divider" />
          <Link href="/markets" className="markets-mode-link markets-mode-link-active" aria-current="page">
            Markets
          </Link>
        </nav>

        <div className="markets-status">
          <button
            type="button"
            className="markets-icon-button"
            aria-label="Refresh market data"
            onClick={refresh}
          >
            <ArrowClockwise size={17} weight="regular" className={refreshing ? 'markets-refreshing' : ''} />
          </button>
          <span className="markets-status-dot" aria-hidden="true" />
          <span className="markets-status-copy">Updated {formatMarketTime(dataAsOf)}</span>
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
              aria-current={active ? 'page' : undefined}
              className={`markets-subnav-link ${active ? 'markets-subnav-link-active' : ''}`}
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
