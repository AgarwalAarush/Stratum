'use client'

import { CaretDown, CaretUp, Funnel } from '@phosphor-icons/react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { MarketSparkline } from './MarketSparkline'
import { ScreenerConditionBuilder } from './ScreenerConditionBuilder'
import {
  DEFAULT_SCREENER_FILTERS,
  DEFAULT_SCREENER_QUERY,
  isScreenerReturnField,
  nextScreenerSort,
  SCREENER_RETURN_PERIODS,
} from '@/lib/markets/screener'
import type {
  ScreenerFilter,
  ScreenerPreset,
  ScreenerQuery,
  ScreenerResponse,
  ScreenerReturnField,
  ScreenerSortField,
} from '@/lib/markets/types'

interface MarketsScreenerProps {
  initialResponse: ScreenerResponse
}

const RESULTS_PAGE_SIZE = 50
const MAX_PREFETCHED_STOCKS = 3
const STOCK_PREFETCH_DELAY_MS = 140

interface SortableHeaderProps {
  direction: 'asc' | 'desc'
  field: ScreenerSortField
  label: string
  onSort: (field: ScreenerSortField) => void
  sort: ScreenerSortField
}

function SortableHeader({ direction, field, label, onSort, sort }: SortableHeaderProps) {
  const active = sort === field
  return (
    <th aria-sort={active ? (direction === 'desc' ? 'descending' : 'ascending') : undefined}>
      <button type="button" className={active ? 'market-sort-active' : ''} onClick={() => onSort(field)}>
        <span>{label}</span>
        {active && (direction === 'desc' ? <CaretDown size={12} aria-hidden="true" /> : <CaretUp size={12} aria-hidden="true" />)}
      </button>
    </th>
  )
}

const PRESETS: Array<{ id: ScreenerPreset; label: string }> = [
  { id: 'momentum', label: 'Momentum leaders' },
  { id: 'unusual-volume', label: 'Unusual volume' },
  { id: 'near-highs', label: 'Near 52W highs' },
  { id: 'gap-movers', label: 'Gap movers' },
]

const PRESET_QUERIES: Record<ScreenerPreset, Pick<ScreenerQuery, 'filters' | 'sort' | 'direction'>> = {
  momentum: { filters: DEFAULT_SCREENER_FILTERS, sort: 'relativeVolume', direction: 'desc' },
  'unusual-volume': {
    filters: [
      { id: 'price-min', field: 'price', operator: 'gt', value: 5, label: 'Price > $5' },
      { id: 'relative-volume-high', field: 'relativeVolume', operator: 'gt', value: 2, label: 'Relative volume > 2×' },
      { id: 'tradable', field: 'tradable', operator: 'eq', value: true, label: 'Tradable' },
    ],
    sort: 'relativeVolume',
    direction: 'desc',
  },
  'near-highs': {
    filters: [
      { id: 'price-min', field: 'price', operator: 'gt', value: 10, label: 'Price > $10' },
      { id: 'near-high', field: 'fiftyTwoWeekPosition', operator: 'gte', value: 85, label: '52W position ≥ 85%' },
      { id: 'tradable', field: 'tradable', operator: 'eq', value: true, label: 'Tradable' },
    ],
    sort: 'fiftyTwoWeekPosition',
    direction: 'desc',
  },
  'gap-movers': {
    filters: [
      { id: 'price-min', field: 'price', operator: 'gt', value: 5, label: 'Price > $5' },
      { id: 'gap-min', field: 'gap', operator: 'gt', value: 2, label: 'Gap > 2%' },
      { id: 'tradable', field: 'tradable', operator: 'eq', value: true, label: 'Tradable' },
    ],
    sort: 'gap',
    direction: 'desc',
  },
}

function formatPrice(value: number): string {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })
}

function formatPercent(value: number | null): string {
  if (value === null) return '—'
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
}

function formatVolume(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return value.toLocaleString('en-US')
}

function feedLabel(feed: ScreenerResponse['feed']): string {
  if (feed === 'illustrative') return 'Illustrative'
  if (feed === 'delayed_sip') return 'Delayed SIP'
  return feed.toUpperCase()
}

function formatMarketTime(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(value))
}

export function MarketsScreener({ initialResponse }: MarketsScreenerProps) {
  const router = useRouter()
  const [preset, setPreset] = useState<ScreenerPreset>(DEFAULT_SCREENER_QUERY.preset)
  const [filters, setFilters] = useState<ScreenerFilter[]>(DEFAULT_SCREENER_FILTERS)
  const [sort, setSort] = useState<ScreenerSortField>(DEFAULT_SCREENER_QUERY.sort)
  const [direction, setDirection] = useState<'asc' | 'desc'>(DEFAULT_SCREENER_QUERY.direction)
  const [response, setResponse] = useState(initialResponse)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const requestRef = useRef<AbortController | null>(null)
  const prefetchTimer = useRef<number | null>(null)
  const prefetchedStocks = useRef(new Set<string>())

  useEffect(() => () => {
    requestRef.current?.abort()
    if (prefetchTimer.current !== null) window.clearTimeout(prefetchTimer.current)
  }, [])

  const execute = useCallback(async (nextQuery?: Partial<ScreenerQuery>) => {
    const query: ScreenerQuery = {
      preset: nextQuery?.preset ?? preset,
      filters: nextQuery?.filters ?? filters,
      sort: nextQuery?.sort ?? sort,
      direction: nextQuery?.direction ?? direction,
      page: nextQuery?.page ?? 1,
      pageSize: RESULTS_PAGE_SIZE,
    }

    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller
    setLoading(true)
    setError('')
    try {
      const result = await fetch('/api/markets/screener', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(query),
        signal: controller.signal,
      })
      const payload = await result.json()
      if (!result.ok) throw new Error(payload?.error?.message ?? 'The screen could not be run')
      if (requestRef.current !== controller) return
      const nextResponse = payload as ScreenerResponse
      setResponse(nextResponse)
    } catch (caught) {
      if (caught instanceof Error && caught.name === 'AbortError') return
      setError(caught instanceof Error ? caught.message : 'The screen could not be run')
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null
        setLoading(false)
      }
    }
  }, [direction, filters, preset, sort])

  const choosePreset = (nextPreset: ScreenerPreset) => {
    const next = PRESET_QUERIES[nextPreset]
    setPreset(nextPreset)
    setFilters([...next.filters])
    setSort(next.sort)
    setDirection(next.direction)
    setSaved(false)
    void execute({ preset: nextPreset, filters: next.filters, sort: next.sort, direction: next.direction, page: 1 })
  }

  const changeFilters = (nextFilters: ScreenerFilter[]) => {
    setFilters(nextFilters)
    setSaved(false)
    void execute({ filters: nextFilters, page: 1 })
  }

  const resetScreen = () => {
    setPreset(DEFAULT_SCREENER_QUERY.preset)
    setFilters([...DEFAULT_SCREENER_FILTERS])
    setSort(DEFAULT_SCREENER_QUERY.sort)
    setDirection(DEFAULT_SCREENER_QUERY.direction)
    setSaved(false)
    void execute(DEFAULT_SCREENER_QUERY)
  }

  const saveScreen = () => {
    localStorage.setItem('stratum:markets:saved-screen:v1', JSON.stringify({ preset, filters, sort, direction }))
    setSaved(true)
  }

  const changeSort = (field: ScreenerSortField) => {
    const presetDefault = PRESET_QUERIES[preset]
    const next = nextScreenerSort(field, { sort, direction }, presetDefault)
    setSort(next.sort)
    setDirection(next.direction)
    void execute({ sort: next.sort, direction: next.direction, page: 1 })
  }

  const openStock = (symbol: string) => router.push(`/markets/stocks/${symbol}`, { scroll: false })
  const preloadStock = useCallback((symbol: string) => {
    if (prefetchedStocks.current.has(symbol) || prefetchedStocks.current.size >= MAX_PREFETCHED_STOCKS) return
    if (prefetchTimer.current !== null) window.clearTimeout(prefetchTimer.current)
    prefetchTimer.current = window.setTimeout(() => {
      if (prefetchedStocks.current.size >= MAX_PREFETCHED_STOCKS) return
      prefetchedStocks.current.add(symbol)
      router.prefetch(`/markets/stocks/${symbol}`)
    }, STOCK_PREFETCH_DELAY_MS)
  }, [router])
  const cancelPreload = () => {
    if (prefetchTimer.current !== null) {
      window.clearTimeout(prefetchTimer.current)
      prefetchTimer.current = null
    }
  }
  const hasPreviousPage = response.page > 1
  const hasNextPage = response.page * response.pageSize < response.total
  const startRow = response.total === 0 ? 0 : (response.page - 1) * response.pageSize + 1
  const endRow = Math.min(response.page * response.pageSize, response.total)
  const selectedReturnField = (filters.find((filter) => isScreenerReturnField(filter.field))?.field ?? 'dailyChange') as ScreenerReturnField
  const selectedReturnPeriod = SCREENER_RETURN_PERIODS.find((period) => period.field === selectedReturnField)!

  return (
    <section className="market-screener" aria-labelledby="stock-screener-title">
      <header className="market-screener-heading">
        <h1 id="stock-screener-title" className="markets-display">Stock Screener</h1>
        <p>Private preview · {feedLabel(response.feed)} data · As of {formatMarketTime(response.dataAsOf)}{response.stale ? ' · Stale' : ''}</p>
      </header>

      <div className="market-filter-bar">
        <button
          type="button"
          className="market-filter-mobile-toggle"
          onClick={() => setFiltersOpen((value) => !value)}
          aria-expanded={filtersOpen}
        >
          <Funnel size={16} /> Conditions ({filters.length})
        </button>
        <div className={`market-filter-conditions ${filtersOpen ? 'market-filter-conditions-open' : ''}`}>
          <span className="market-filter-prefix">Show US equities where</span>
          <ScreenerConditionBuilder filters={filters} onChange={changeFilters} />
        </div>
        <div className="market-filter-actions">
          <button type="button" className="market-action-link" onClick={resetScreen}>Reset</button>
          <span className="market-action-divider" aria-hidden="true" />
          <button type="button" className="market-action-link" onClick={saveScreen}>{saved ? 'Saved locally' : 'Save screen'}</button>
        </div>
      </div>

      {error && <p className="market-screen-error" role="alert">{error}</p>}

      <nav className="market-preset-tabs" aria-label="Screener presets">
        {PRESETS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={preset === item.id ? 'market-preset-active' : ''}
            aria-current={preset === item.id ? 'page' : undefined}
            onClick={() => choosePreset(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div className="market-screen-summary">
        <span>{response.total} matches</span>
        <span className="market-screen-update-status" aria-live="polite">{loading ? 'Updating…' : ''}</span>
      </div>

      <div className={`market-screen-table-wrap scrollbar-none ${loading ? 'market-screen-table-loading' : ''}`} aria-busy={loading}>
        <table className="market-screen-table">
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Company</th>
              <SortableHeader field="price" label="Price" sort={sort} direction={direction} onSort={changeSort} />
              <SortableHeader field={selectedReturnField} label={`Change (${selectedReturnPeriod.shortLabel})`} sort={sort} direction={direction} onSort={changeSort} />
              <SortableHeader field="gap" label="Gap" sort={sort} direction={direction} onSort={changeSort} />
              <SortableHeader field="volume" label="Volume" sort={sort} direction={direction} onSort={changeSort} />
              <SortableHeader field="relativeVolume" label="Rel. volume" sort={sort} direction={direction} onSort={changeSort} />
              <th>Range</th>
              <SortableHeader field="fiftyDayAverage" label="50D MA" sort={sort} direction={direction} onSort={changeSort} />
              <SortableHeader field="fiftyTwoWeekPosition" label="52W position" sort={sort} direction={direction} onSort={changeSort} />
              <th>Exchange</th>
              <th>As of</th>
            </tr>
          </thead>
          <tbody>
            {response.rows.length === 0 ? (
              <tr><td colSpan={12} className="market-screen-empty">No equities match these conditions. Remove a filter or choose another preset.</td></tr>
            ) : response.rows.map((row) => {
              return (
                <tr
                  key={row.symbol}
                  className="market-screen-stock-row"
                  role="link"
                  tabIndex={0}
                  aria-label={`Open ${row.company} (${row.symbol})`}
                  onMouseEnter={() => preloadStock(row.symbol)}
                  onMouseLeave={cancelPreload}
                  onFocus={() => preloadStock(row.symbol)}
                  onBlur={cancelPreload}
                  onClick={() => openStock(row.symbol)}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return
                    event.preventDefault()
                    openStock(row.symbol)
                  }}
                >
                  <td><span className="market-symbol-button">{row.symbol}</span></td>
                  <td>{row.company}</td>
                  <td>{formatPrice(row.price)}</td>
                  <td className={(row[selectedReturnField] ?? 0) >= 0 ? 'market-positive' : 'market-negative'}>{formatPercent(row[selectedReturnField])}</td>
                  <td className={row.gap >= 0 ? 'market-positive' : 'market-negative'}>{formatPercent(row.gap)}</td>
                  <td>{formatVolume(row.volume)}</td>
                  <td className="market-positive">{row.relativeVolume.toFixed(2)}×</td>
                  <td><MarketSparkline values={row.range} label={`${row.symbol} intraday range`} /></td>
                  <td>{formatPrice(row.fiftyDayAverage)}</td>
                  <td>
                    <div className="market-52-week-cell">
                      <span>{row.fiftyTwoWeekPosition}%</span>
                      <span className="market-52-week-track"><i style={{ left: `${row.fiftyTwoWeekPosition}%` }} /></span>
                    </div>
                  </td>
                  <td>{row.exchange}</td>
                  <td>{formatMarketTime(row.asOf)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <footer className="market-screen-footer">
        <div className="market-pagination-summary">{response.total === 0 ? '0' : `${startRow}–${endRow}`} of {response.total}</div>
        <div className="market-screen-load-more" aria-live="polite">
          <button type="button" onClick={() => void execute({ page: response.page - 1 })} disabled={loading || !hasPreviousPage}>Previous</button>
          <span>Page {response.page} of {Math.max(1, Math.ceil(response.total / response.pageSize))}</span>
          <button type="button" onClick={() => void execute({ page: response.page + 1 })} disabled={loading || !hasNextPage}>Next</button>
        </div>
        <span>US equities · {response.feed} feed{response.stale ? ' · stale' : ''}</span>
        <span>Snapshot calculated from normalized market data</span>
      </footer>
    </section>
  )
}
