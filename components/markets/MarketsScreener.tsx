'use client'

import Link from 'next/link'
import { CaretDown, CaretLeft, CaretRight, CaretUp, Funnel, X } from '@phosphor-icons/react'
import { useState } from 'react'
import { MarketSparkline } from './MarketSparkline'
import {
  DEFAULT_SCREENER_FILTERS,
  DEFAULT_SCREENER_QUERY,
} from '@/lib/markets/screener'
import type {
  ScreenerFilter,
  ScreenerPreset,
  ScreenerQuery,
  ScreenerResponse,
  ScreenerSortField,
} from '@/lib/markets/types'

interface MarketsScreenerProps {
  initialResponse: ScreenerResponse
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

const ADDITIONAL_FILTERS: ScreenerFilter[] = [
  { id: 'volume-min', field: 'volume', operator: 'gt', value: 5_000_000, label: 'Volume > 5M' },
  { id: 'near-high', field: 'fiftyTwoWeekPosition', operator: 'gte', value: 85, label: '52W position ≥ 85%' },
  { id: 'nasdaq', field: 'exchange', operator: 'eq', value: 'NASDAQ', label: 'Exchange = NASDAQ' },
  { id: 'price-max', field: 'price', operator: 'lt', value: 100, label: 'Price < $100' },
]

function formatPrice(value: number): string {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })
}

function formatPercent(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
}

function formatVolume(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return value.toLocaleString('en-US')
}

export function MarketsScreener({ initialResponse }: MarketsScreenerProps) {
  const [preset, setPreset] = useState<ScreenerPreset>(DEFAULT_SCREENER_QUERY.preset)
  const [filters, setFilters] = useState<ScreenerFilter[]>(DEFAULT_SCREENER_FILTERS)
  const [sort, setSort] = useState<ScreenerSortField>(DEFAULT_SCREENER_QUERY.sort)
  const [direction, setDirection] = useState<'asc' | 'desc'>(DEFAULT_SCREENER_QUERY.direction)
  const [response, setResponse] = useState(initialResponse)
  const [selectedSymbol, setSelectedSymbol] = useState('PLTR')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)

  const execute = async (nextQuery?: Partial<ScreenerQuery>) => {
    const query: ScreenerQuery = {
      preset: nextQuery?.preset ?? preset,
      filters: nextQuery?.filters ?? filters,
      sort: nextQuery?.sort ?? sort,
      direction: nextQuery?.direction ?? direction,
      page: nextQuery?.page ?? 1,
      pageSize: 10,
    }

    setLoading(true)
    setError('')
    try {
      const result = await fetch('/api/markets/screener', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(query),
      })
      const payload = await result.json()
      if (!result.ok) throw new Error(payload?.error?.message ?? 'The screen could not be run')
      setResponse(payload as ScreenerResponse)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The screen could not be run')
    } finally {
      setLoading(false)
    }
  }

  const choosePreset = (nextPreset: ScreenerPreset) => {
    const next = PRESET_QUERIES[nextPreset]
    setPreset(nextPreset)
    setFilters([...next.filters])
    setSort(next.sort)
    setDirection(next.direction)
    setSaved(false)
    void execute({ preset: nextPreset, filters: next.filters, sort: next.sort, direction: next.direction, page: 1 })
  }

  const removeFilter = (id: string) => {
    setFilters((current) => current.filter((filter) => filter.id !== id))
    setSaved(false)
  }

  const addCondition = () => {
    const next = ADDITIONAL_FILTERS.find((candidate) => !filters.some((filter) => filter.id === candidate.id))
    if (!next) return
    setFilters((current) => [...current, next])
    setSaved(false)
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
    const nextDirection = field === sort && direction === 'desc' ? 'asc' : 'desc'
    setSort(field)
    setDirection(nextDirection)
    void execute({ sort: field, direction: nextDirection, page: 1 })
  }

  const totalPages = Math.max(1, Math.ceil(response.total / response.pageSize))
  const visiblePages = Array.from({ length: Math.min(totalPages, 4) }, (_, index) => index + 1)
  const startRow = response.total === 0 ? 0 : (response.page - 1) * response.pageSize + 1
  const endRow = Math.min(response.page * response.pageSize, response.total)

  return (
    <section className="market-screener" aria-labelledby="stock-screener-title">
      <header className="market-screener-heading">
        <h1 id="stock-screener-title" className="markets-display">Stock Screener</h1>
        <p>Private preview · Illustrative data · As of 4:00 PM ET</p>
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
          <div className="market-filter-chips">
            {filters.map((filter) => (
              <span key={filter.id} className="market-filter-chip">
                {filter.label}
                <button type="button" onClick={() => removeFilter(filter.id)} aria-label={`Remove ${filter.label}`}>
                  <X size={12} />
                </button>
              </span>
            ))}
            <button type="button" className="market-add-condition" onClick={addCondition} disabled={filters.length >= DEFAULT_SCREENER_FILTERS.length + ADDITIONAL_FILTERS.length}>
              + Add condition
            </button>
          </div>
        </div>
        <div className="market-filter-actions">
          <button type="button" className="markets-primary-button" onClick={() => void execute()} disabled={loading}>
            {loading ? 'Running…' : 'Run screen'}
          </button>
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
        <button type="button" onClick={() => changeSort('relativeVolume')}>
          Relative volume {sort === 'relativeVolume' && direction === 'desc' ? <CaretDown size={14} /> : <CaretUp size={14} />}
        </button>
      </div>

      <div className={`market-screen-table-wrap ${loading ? 'market-screen-table-loading' : ''}`} aria-busy={loading}>
        <table className="market-screen-table">
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Company</th>
              <th><button type="button" onClick={() => changeSort('price')}>Price</button></th>
              <th><button type="button" onClick={() => changeSort('dailyChange')}>Change</button></th>
              <th><button type="button" onClick={() => changeSort('gap')}>Gap</button></th>
              <th><button type="button" onClick={() => changeSort('volume')}>Volume</button></th>
              <th><button type="button" onClick={() => changeSort('relativeVolume')}>Rel. volume</button></th>
              <th>Range</th>
              <th><button type="button" onClick={() => changeSort('fiftyDayAverage')}>50D MA</button></th>
              <th><button type="button" onClick={() => changeSort('fiftyTwoWeekPosition')}>52W position</button></th>
              <th>Exchange</th>
              <th>As of</th>
              <th><span className="sr-only">Research</span></th>
            </tr>
          </thead>
          <tbody>
            {response.rows.length === 0 ? (
              <tr><td colSpan={13} className="market-screen-empty">No equities match these conditions. Remove a filter or choose another preset.</td></tr>
            ) : response.rows.map((row) => {
              const selected = row.symbol === selectedSymbol
              return (
                <tr key={row.symbol} className={selected ? 'market-screen-row-selected' : ''}>
                  <td><button type="button" className="market-symbol-button" onClick={() => setSelectedSymbol(row.symbol)}>{row.symbol}</button></td>
                  <td>{row.company}</td>
                  <td>{formatPrice(row.price)}</td>
                  <td className={row.dailyChange >= 0 ? 'market-positive' : 'market-negative'}>{formatPercent(row.dailyChange)}</td>
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
                  <td>4:00 PM ET</td>
                  <td>{selected && <Link href={`/markets/research?symbol=${row.symbol}`}>View research</Link>}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <footer className="market-screen-footer">
        <div className="market-pagination-summary">{startRow}–{endRow} of {response.total}</div>
        <nav className="market-pagination" aria-label="Screener pages">
          <button type="button" aria-label="Previous page" disabled={response.page <= 1} onClick={() => void execute({ page: response.page - 1 })}><CaretLeft size={14} /></button>
          {visiblePages.map((page) => (
            <button key={page} type="button" className={page === response.page ? 'market-page-active' : ''} aria-current={page === response.page ? 'page' : undefined} onClick={() => void execute({ page })}>{page}</button>
          ))}
          {totalPages > 4 && <span>…</span>}
          {totalPages > 4 && <button type="button" onClick={() => void execute({ page: totalPages })}>{totalPages}</button>}
          <button type="button" aria-label="Next page" disabled={response.page >= totalPages} onClick={() => void execute({ page: response.page + 1 })}><CaretRight size={14} /></button>
        </nav>
        <span>US equities · illustrative feed</span>
        <span>Snapshot calculated from normalized market data</span>
      </footer>
    </section>
  )
}
