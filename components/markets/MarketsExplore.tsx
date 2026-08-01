'use client'

import { useState } from 'react'
import { MarketsIntentLink } from './MarketsIntentLink'
import { MarketsScreener } from './MarketsScreener'
import { MarketsWatchlists } from './MarketsWatchlists'
import type { MarketGroupMetric, MarketLeadershipSnapshot, ScreenerResponse } from '@/lib/markets/types'
import type { MarketWatchlistState } from '@/lib/markets/watchlists'

type ExploreView = 'stocks' | 'sectors' | 'sub-industries' | 'watchlists'

function percent(value: number | null): string {
  return value === null ? '—' : `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`
}

function GroupTable({
  groups,
  leadership,
}: {
  groups: MarketGroupMetric[]
  leadership: MarketLeadershipSnapshot | null
}) {
  const [selected, setSelected] = useState(groups[0]?.label ?? '')
  const group = groups.find((item) => item.label === selected) ?? groups[0]
  const constituents = leadership?.stocks
    .filter((stock) => group?.groupType === 'sector' ? stock.sector === group.label : stock.subIndustry === group?.label)
    .sort((left, right) => (right.return30d ?? -Infinity) - (left.return30d ?? -Infinity)) ?? []

  return (
    <div className="market-explore-groups">
      <div className="market-group-table-wrap">
        <table className="market-group-table">
          <thead><tr><th>Group</th><th>n</th><th>1d</th><th>30d</th><th>50d</th><th>200d</th><th>1yr</th><th>vs50</th><th>vs200</th></tr></thead>
          <tbody>
            {groups.map((item) => (
              <tr
                key={`${item.sector}-${item.label}`}
                className={item.label === group?.label ? 'market-group-selected' : ''}
                role="button"
                tabIndex={0}
                aria-pressed={item.label === group?.label}
                aria-label={`Show ${item.label} details`}
                onClick={() => setSelected(item.label)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return
                  event.preventDefault()
                  setSelected(item.label)
                }}
              >
                <td>{item.label}</td>
                <td>{item.constituentCount}</td>
                <td className={(item.dayReturn ?? 0) >= 0 ? 'market-positive' : 'market-negative'}>{percent(item.dayReturn)}</td>
                <td className={(item.return30d ?? 0) >= 0 ? 'market-positive' : 'market-negative'}>{percent(item.return30d)}</td>
                <td>{percent(item.return50d)}</td>
                <td>{percent(item.return200d)}</td>
                <td>{percent(item.return1y)}</td>
                <td>{percent(item.vs50DayAverage)}</td>
                <td>{percent(item.vs200DayAverage)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {group ? (
        <aside className="market-group-drilldown">
          <p className="markets-eyebrow">{group.groupType === 'sector' ? 'Sector' : group.sector}</p>
          <h2>{group.label}</h2>
          <div className="market-group-stats">
            <div><strong>{percent(group.dayReturn)}</strong><span>today</span></div>
            <div><strong>{percent(group.return30d)}</strong><span>30 days</span></div>
            <div><strong>{percent(group.return1y)}</strong><span>1 year</span></div>
            <div><strong>{percent(group.vs200DayAverage)}</strong><span>vs 200d</span></div>
          </div>
          <h3><span>Constituents</span><span>{Math.min(20, constituents.length)} of {constituents.length} · ranked 30d</span></h3>
          <div className="market-group-constituents">
            {constituents.slice(0, 20).map((stock) => (
              <MarketsIntentLink href={`/markets/stocks/${stock.symbol}`} key={stock.symbol}>
                <span>{stock.symbol}</span><span>{percent(stock.return30d)}</span>
              </MarketsIntentLink>
            ))}
          </div>
          <MarketsIntentLink className="market-group-filter-link" href={`/markets/explore?view=stocks&group=${encodeURIComponent(group.label)}`}>
            Open as filtered stock screen →
          </MarketsIntentLink>
        </aside>
      ) : null}
    </div>
  )
}

export function MarketsExplore({
  initialView,
  screener,
  leadership,
  watchlists,
  watchlistsPersisted,
}: {
  initialView: ExploreView
  screener: ScreenerResponse
  leadership: MarketLeadershipSnapshot | null
  watchlists?: MarketWatchlistState
  watchlistsPersisted?: boolean
}) {
  return (
    <section className="market-explore">
      <header className="market-explore-heading">
        <div>
          <p className="markets-eyebrow">From market structure to names</p>
          <h1 className="markets-display">Explore</h1>
        </div>
        {leadership ? <span>Hermes snapshot · {leadership.tradingDate} · {leadership.usableCount}/{leadership.universeCount} usable</span> : null}
      </header>
      <nav className="market-explore-tabs" aria-label="Explore market data">
        {([
          ['stocks', 'Stocks'],
          ['sectors', 'Sectors'],
          ['sub-industries', 'Sub-industries'],
          ['watchlists', 'Watchlists'],
        ] as const).map(([id, label]) => (
          <MarketsIntentLink key={id} href={`/markets/explore?view=${id}`} aria-current={initialView === id ? 'page' : undefined}>{label}</MarketsIntentLink>
        ))}
      </nav>
      {initialView === 'stocks' ? <MarketsScreener initialResponse={screener} /> : initialView === 'watchlists' ? (
        <MarketsWatchlists
          embedded
          universe={screener}
          initialState={watchlists}
          migrateLocalOnMount={!watchlistsPersisted}
        />
      ) : (
        <GroupTable
          groups={initialView === 'sectors' ? leadership?.sectors ?? [] : leadership?.subIndustries ?? []}
          leadership={leadership}
        />
      )}
    </section>
  )
}
