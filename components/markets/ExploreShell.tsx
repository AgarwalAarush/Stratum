import type { ReactNode } from 'react'
import type { ExploreView } from '@/lib/markets/explore'
import { MarketsIntentLink } from './MarketsIntentLink'
import styles from './Explore.module.css'

export function ExploreShell({ view, children }: { view: ExploreView; children: ReactNode }) {
  return <section className={`market-explore ${styles.page}`}>
    <header className="market-explore-heading">
      <div><p className="markets-eyebrow">Market explorer</p><h1 className="markets-display">Explore</h1></div>
    </header>
    <nav className="market-explore-tabs" aria-label="Explore market data">
      {([
        ['stocks', 'Stocks'], ['sectors', 'Sectors'], ['sub-industries', 'Sub-industries'], ['watchlists', 'Watchlists'],
      ] as const).map(([id, label]) => <MarketsIntentLink key={id} href={`/markets/explore?view=${id}`} aria-current={view === id ? 'page' : undefined}>{label}</MarketsIntentLink>)}
    </nav>
    {children}
  </section>
}

export function ExploreLoading() {
  return <div className={styles.loading} role="status" aria-label="Loading selected market view">
    <span>Loading saved market data…</span><div /><div /><div />
  </div>
}
