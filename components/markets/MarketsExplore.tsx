'use client'

import { useMemo, useState } from 'react'
import { MarketsIntentLink } from './MarketsIntentLink'
import dynamic from 'next/dynamic'
import type { ExploreData, ExploreLeadership } from '@/lib/markets/explore'
import styles from './Explore.module.css'
import type { MarketGroupMetric } from '@/lib/markets/types'

const MarketsScreener = dynamic(() => import('./MarketsScreener').then(module => module.MarketsScreener))
const MarketsWatchlists = dynamic(() => import('./MarketsWatchlists').then(module => module.MarketsWatchlists))

function percent(value: number | null): string {
  return value === null ? '—' : `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`
}

const GROUP_COLUMNS = [
  { key: 'label', label: 'Group' },
  { key: 'dayReturn', label: '1d' },
  { key: 'return30d', label: '30d' },
  { key: 'return50d', label: '50d' },
  { key: 'return200d', label: '200d' },
  { key: 'return1y', label: '1yr' },
  { key: 'vs50DayAverage', label: 'vs 50d avg', title: 'Average distance from each constituent’s 50-trading-day moving average' },
  { key: 'vs200DayAverage', label: 'vs 200d avg', title: 'Average distance from each constituent’s 200-trading-day moving average' },
] as const

type GroupSortKey = (typeof GROUP_COLUMNS)[number]['key']

function metricTone(value: number | null): string | undefined {
  if (value === null || value === 0) return undefined
  return value > 0 ? 'market-positive' : 'market-negative'
}

function GroupTable({
  groups,
  leadership,
}: {
  groups: MarketGroupMetric[]
  leadership: ExploreLeadership | null
}) {
  const [selected, setSelected] = useState(groups[0]?.label ?? '')
  const [sort, setSort] = useState<{ key: GroupSortKey; direction: 'ascending' | 'descending' }>({
    key: 'return30d',
    direction: 'descending',
  })
  const group = groups.find((item) => item.label === selected) ?? groups[0]
  const sortedGroups = useMemo(() => [...groups].sort((left, right) => {
    const multiplier = sort.direction === 'ascending' ? 1 : -1
    if (sort.key === 'label') {
      return left.label.localeCompare(right.label) * multiplier
    }
    const leftValue = left[sort.key]
    const rightValue = right[sort.key]
    if (leftValue === null) return 1
    if (rightValue === null) return -1
    return (leftValue - rightValue) * multiplier
  }), [groups, sort])
  const constituents = leadership?.stocks
    .filter((stock) => group?.groupType === 'sector' ? stock.sector === group.label : stock.subIndustry === group?.label)
    .sort((left, right) => (right.return30d ?? -Infinity) - (left.return30d ?? -Infinity)) ?? []

  return (
    <div className="market-explore-groups">
      <div className="market-group-table-wrap">
        <table className="market-group-table">
          <thead><tr>{GROUP_COLUMNS.map((column) => {
            const active = sort.key === column.key
            const direction = active ? sort.direction : undefined
            return (
              <th key={column.key} aria-sort={direction} title={'title' in column ? column.title : undefined}>
                <button
                  type="button"
                  onClick={() => setSort((current) => current.key === column.key
                    ? { ...current, direction: current.direction === 'ascending' ? 'descending' : 'ascending' }
                    : { key: column.key, direction: 'descending' })}
                >
                  {column.label}<span aria-hidden="true">{active ? (sort.direction === 'ascending' ? ' ↑' : ' ↓') : ''}</span>
                </button>
              </th>
            )
          })}</tr></thead>
          <tbody>
            {sortedGroups.map((item) => (
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
                <td className={metricTone(item.dayReturn)}>{percent(item.dayReturn)}</td>
                <td className={metricTone(item.return30d)}>{percent(item.return30d)}</td>
                <td className={metricTone(item.return50d)}>{percent(item.return50d)}</td>
                <td className={metricTone(item.return200d)}>{percent(item.return200d)}</td>
                <td className={metricTone(item.return1y)}>{percent(item.return1y)}</td>
                <td className={metricTone(item.vs50DayAverage)}>{percent(item.vs50DayAverage)}</td>
                <td className={metricTone(item.vs200DayAverage)}>{percent(item.vs200DayAverage)}</td>
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
          <MarketsIntentLink className="market-group-filter-link" href={`/markets/explore?view=stocks&group=${encodeURIComponent(group.label)}&groupType=${group.groupType}`}>
            Open as filtered stock screen →
          </MarketsIntentLink>
        </aside>
      ) : null}
    </div>
  )
}

export function MarketsExplore({ data }: { data: ExploreData }) {
  if (data.view === 'stocks') return <MarketsScreener key={JSON.stringify(data.query)} initialResponse={data.screener} initialQuery={data.query} />
  if (data.view === 'watchlists') return <MarketsWatchlists embedded universe={data.universe} initialState={data.watchlists} migrateLocalOnMount={!data.persisted} />
  if (!data.leadership) return <p className={styles.empty} role="status">Sector data is unavailable. Try Stocks or refresh this view.</p>
  const groups = data.view === 'sectors' ? data.leadership.sectors : data.leadership.subIndustries
  return <>
    <p className={styles.metadata}>Saved leadership snapshot · {data.leadership.tradingDate} · {data.leadership.usableCount}/{data.leadership.universeCount} usable</p>
    {groups.length ? <GroupTable key={data.view} groups={groups} leadership={data.leadership} /> : <p className={styles.empty}>No groups in this snapshot.</p>}
  </>
}
