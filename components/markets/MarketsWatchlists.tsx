'use client'

import {
  Check,
  MagnifyingGlass,
  PencilSimple,
  Plus,
  Trash,
  X,
} from '@phosphor-icons/react'
import { FormEvent, useEffect, useMemo, useState } from 'react'
import { MarketSparkline } from './MarketSparkline'
import { MarketsIntentLink } from './MarketsIntentLink'
import {
  createDefaultWatchlistState,
  isValidWatchlistSymbol,
  parseWatchlistState,
  updateWatchlist,
  WATCHLIST_STORAGE_KEY,
  type MarketWatchlistState,
} from '@/lib/markets/watchlists'
import type { ScreenerResponse, ScreenerRow } from '@/lib/markets/types'

interface MarketsWatchlistsProps {
  universe: ScreenerResponse
  initialState?: MarketWatchlistState
  migrateLocalOnMount?: boolean
  embedded?: boolean
}

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

function nextListId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `list-${Date.now()}`
}

export function MarketsWatchlists({ universe, initialState, migrateLocalOnMount = false, embedded = false }: MarketsWatchlistsProps) {
  const fallbackState = useMemo(
    () => createDefaultWatchlistState(universe.rows.map((row) => row.symbol)),
    [universe.rows],
  )
  const [state, setState] = useState<MarketWatchlistState>(initialState ?? fallbackState)
  const [hydrated, setHydrated] = useState(false)
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [creatingList, setCreatingList] = useState(false)
  const [newListName, setNewListName] = useState('')
  const [renamingList, setRenamingList] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [deleteArmed, setDeleteArmed] = useState(false)
  const [notice, setNotice] = useState('')
  const [persistence, setPersistence] = useState<'loading' | 'server' | 'local'>('loading')

  useEffect(() => {
    let active = true
    const migrate = async () => {
      let nextState = initialState ?? fallbackState
      try {
        const saved = localStorage.getItem(WATCHLIST_STORAGE_KEY)
        if (migrateLocalOnMount && saved) nextState = parseWatchlistState(JSON.parse(saved), nextState)
      } catch {
        setNotice('Saved lists could not be read. A fresh list is ready instead.')
      }
      try {
        const response = await fetch('/api/markets/portfolio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'replace-watchlists', state: nextState }),
        })
        const payload = await response.json()
        if (!response.ok) throw new Error()
        if (active) {
          setState(payload.watchlists)
          setPersistence('server')
        }
      } catch {
        if (active) {
          setState(nextState)
          setPersistence('local')
        }
      } finally {
        if (active) setHydrated(true)
      }
    }
    void migrate()
    return () => { active = false }
  }, [fallbackState, initialState, migrateLocalOnMount])

  useEffect(() => {
    if (!hydrated) return
    localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(state))
    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch('/api/markets/portfolio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'replace-watchlists', state }),
        })
        setPersistence(response.ok ? 'server' : 'local')
      } catch {
        setPersistence('local')
      }
    }, 250)
    return () => window.clearTimeout(timeout)
  }, [hydrated, state])

  const activeList = state.lists.find((list) => list.id === state.activeListId) ?? state.lists[0]!
  const rowBySymbol = useMemo(
    () => new Map(universe.rows.map((row) => [row.symbol, row])),
    [universe.rows],
  )
  const trackedRows = activeList.symbols.map((symbol) => ({ symbol, row: rowBySymbol.get(symbol) }))
  const normalizedQuery = query.trim().toUpperCase()
  const suggestions = universe.rows
    .filter((row) => !activeList.symbols.includes(row.symbol))
    .filter((row) => !normalizedQuery
      || row.symbol.includes(normalizedQuery)
      || row.company.toUpperCase().includes(normalizedQuery))
    .slice(0, 6)
  const knownRows = trackedRows.flatMap(({ row }) => row ? [row] : [])
  const gainers = knownRows.filter((row) => row.dailyChange > 0).length
  const averageMove = knownRows.length === 0
    ? 0
    : knownRows.reduce((sum, row) => sum + row.dailyChange, 0) / knownRows.length
  const aboveAverage = knownRows.filter((row) => row.price >= row.fiftyDayAverage).length
  const canAddTypedSymbol = isValidWatchlistSymbol(normalizedQuery) && !activeList.symbols.includes(normalizedQuery)

  const replaceActiveList = (update: Parameters<typeof updateWatchlist>[2]) => {
    setState((current) => updateWatchlist(current, current.activeListId, update))
  }

  const activateList = (listId: string) => {
    setState((current) => ({ ...current, activeListId: listId }))
    setDeleteArmed(false)
    setRenamingList(false)
    setNotice('')
  }

  const addSymbol = (symbol: string) => {
    const normalized = symbol.trim().toUpperCase()
    if (!isValidWatchlistSymbol(normalized) || activeList.symbols.includes(normalized)) return
    replaceActiveList((list) => ({ ...list, symbols: [...list.symbols, normalized] }))
    setQuery('')
    setSearchOpen(false)
    setNotice(`${normalized} added to ${activeList.name}.`)
  }

  const removeSymbol = (symbol: string) => {
    replaceActiveList((list) => ({ ...list, symbols: list.symbols.filter((item) => item !== symbol) }))
    setNotice(`${symbol} removed from ${activeList.name}.`)
  }

  const createList = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const name = newListName.trim().slice(0, 40)
    if (!name || state.lists.length >= 12) return
    const id = nextListId()
    setState((current) => ({
      ...current,
      activeListId: id,
      lists: [...current.lists, { id, name, symbols: [] }],
    }))
    setNewListName('')
    setCreatingList(false)
    setNotice(`${name} created.`)
  }

  const renameList = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const name = renameValue.trim().slice(0, 40)
    if (!name) return
    replaceActiveList((list) => ({ ...list, name }))
    setRenamingList(false)
    setNotice(`Watchlist renamed to ${name}.`)
  }

  const deleteList = () => {
    if (state.lists.length <= 1) return
    if (!deleteArmed) {
      setDeleteArmed(true)
      setNotice(`Select delete again to remove ${activeList.name}.`)
      return
    }
    const remaining = state.lists.filter((list) => list.id !== activeList.id)
    setState({ version: 1, activeListId: remaining[0]!.id, lists: remaining })
    setDeleteArmed(false)
    setNotice(`${activeList.name} deleted.`)
  }

  return (
    <section className={`market-watchlists${embedded ? ' market-watchlists-embedded' : ''}`} aria-labelledby="market-watchlists-title">
      {!embedded ? <header className="market-screener-heading market-watchlists-heading">
        <h1 id="market-watchlists-title" className="markets-display">Watchlists</h1>
        <p>{feedLabel(universe.feed)} data · As of {formatMarketTime(universe.dataAsOf)}{universe.stale ? ' · Stale' : ''} · {persistence === 'server' ? 'Saved privately' : 'Local fallback'}</p>
      </header> : <h2 id="market-watchlists-title" className="sr-only">Watchlists</h2>}

      <div className="market-watchlist-toolbar">
        <nav className="market-watchlist-tabs" aria-label="Saved watchlists">
          {state.lists.map((list) => (
            <button
              key={list.id}
              type="button"
              className={list.id === activeList.id ? 'market-watchlist-tab-active' : ''}
              aria-current={list.id === activeList.id ? 'page' : undefined}
              onClick={() => activateList(list.id)}
            >
              <span>{list.name}</span>
              <small>{list.symbols.length}</small>
            </button>
          ))}
          <button type="button" className="market-watchlist-new" onClick={() => setCreatingList(true)} disabled={state.lists.length >= 12}>
            <Plus size={13} /> New list
          </button>
        </nav>

        {creatingList && (
          <form className="market-watchlist-inline-form" onSubmit={createList}>
            <label htmlFor="new-watchlist-name">List name</label>
            <div>
              <input id="new-watchlist-name" value={newListName} onChange={(event) => setNewListName(event.target.value)} maxLength={40} autoFocus />
              <button type="submit" aria-label="Create watchlist"><Check size={14} /></button>
              <button type="button" aria-label="Cancel new watchlist" onClick={() => setCreatingList(false)}><X size={14} /></button>
            </div>
          </form>
        )}
      </div>

      <div className="market-watchlist-commandbar">
        <div className="market-watchlist-context">
          {renamingList ? (
            <form className="market-watchlist-rename" onSubmit={renameList}>
              <input aria-label="Watchlist name" value={renameValue} onChange={(event) => setRenameValue(event.target.value)} maxLength={40} autoFocus />
              <button type="submit" aria-label="Save watchlist name"><Check size={14} /></button>
              <button type="button" aria-label="Cancel rename" onClick={() => setRenamingList(false)}><X size={14} /></button>
            </form>
          ) : (
            <div>
              <span>Tracking</span>
              <strong>{activeList.symbols.length} {activeList.symbols.length === 1 ? 'equity' : 'equities'}</strong>
              <span>in {activeList.name}</span>
            </div>
          )}
          <div className="market-watchlist-list-actions">
            <button type="button" onClick={() => { setRenameValue(activeList.name); setRenamingList(true); setDeleteArmed(false) }} aria-label={`Rename ${activeList.name}`}><PencilSimple size={14} /> Rename</button>
            <button type="button" className={deleteArmed ? 'market-watchlist-delete-armed' : ''} onClick={deleteList} disabled={state.lists.length <= 1} aria-label={`Delete ${activeList.name}`}><Trash size={14} /> {deleteArmed ? 'Confirm delete' : 'Delete'}</button>
          </div>
        </div>

        <div className="market-watchlist-search">
          <div className="market-watchlist-search-field">
            <MagnifyingGlass size={15} aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => { setQuery(event.target.value); setSearchOpen(true); setNotice('') }}
              onFocus={() => setSearchOpen(true)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setSearchOpen(false)
                if (event.key === 'Enter' && canAddTypedSymbol) {
                  event.preventDefault()
                  addSymbol(normalizedQuery)
                }
              }}
              placeholder="Search symbol or company"
              aria-label="Search equities to add"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={searchOpen}
              aria-controls="watchlist-symbol-suggestions"
            />
            {query && <button type="button" aria-label="Clear symbol search" onClick={() => setQuery('')}><X size={13} /></button>}
          </div>
          <button type="button" className="market-watchlist-add-button" disabled={!canAddTypedSymbol} onClick={() => addSymbol(normalizedQuery)}>
            <Plus size={14} /> Add symbol
          </button>
          {searchOpen && query && (
            <div id="watchlist-symbol-suggestions" className="market-watchlist-suggestions" role="listbox">
              {suggestions.map((row) => (
                <button key={row.symbol} type="button" role="option" aria-selected="false" onMouseDown={(event) => event.preventDefault()} onClick={() => addSymbol(row.symbol)}>
                  <strong>{row.symbol}</strong>
                  <span>{row.company}</span>
                  <small>{formatPrice(row.price)} · {formatPercent(row.dailyChange)}</small>
                </button>
              ))}
              {suggestions.length === 0 && canAddTypedSymbol && (
                <button type="button" role="option" aria-selected="false" onMouseDown={(event) => event.preventDefault()} onClick={() => addSymbol(normalizedQuery)}>
                  <strong>{normalizedQuery}</strong>
                  <span>Add ticker without current snapshot data</span>
                  <small>Local watchlist</small>
                </button>
              )}
              {suggestions.length === 0 && !canAddTypedSymbol && <p>No additional matches in the current market snapshot.</p>}
            </div>
          )}
        </div>
      </div>

      <p className="market-watchlist-notice" aria-live="polite">
        {notice || (hydrated ? (persistence === 'server' ? 'Changes save to your private workspace.' : 'Changes are using the local fallback.') : 'Loading saved lists…')}
      </p>

      <div className="market-watchlist-metrics" aria-label={`${activeList.name} summary`}>
        <div><span>Names</span><strong>{activeList.symbols.length}</strong></div>
        <div><span>Gainers</span><strong>{gainers}</strong></div>
        <div><span>Average move</span><strong className={averageMove >= 0 ? 'market-positive' : 'market-negative'}>{formatPercent(averageMove)}</strong></div>
        <div><span>Above 50D MA</span><strong>{aboveAverage}<small> / {knownRows.length}</small></strong></div>
      </div>

      <div className="market-screen-summary">
        <span>{activeList.symbols.length} tracked {activeList.symbols.length === 1 ? 'name' : 'names'}</span>
        <span>{knownRows.length} with current snapshot data</span>
      </div>

      <div className="market-watchlist-table-wrap scrollbar-none">
        <table className="market-screen-table market-watchlist-table">
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Company</th>
              <th>Price</th>
              <th>Change</th>
              <th>Volume</th>
              <th>Rel. volume</th>
              <th>Range</th>
              <th>50D MA</th>
              <th>52W position</th>
              <th>As of</th>
              <th><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {trackedRows.length === 0 ? (
              <tr>
                <td colSpan={11} className="market-watchlist-empty">
                  <strong>This list is ready for its first name.</strong>
                  <span>Search a symbol above or add any valid US ticker.</span>
                </td>
              </tr>
            ) : trackedRows.map(({ symbol, row }) => row ? (
              <WatchlistRow key={symbol} row={row} onRemove={removeSymbol} />
            ) : (
              <tr key={symbol}>
                <td><MarketsIntentLink className="market-symbol-button" href={`/markets/stocks/${symbol}`} scroll={false}>{symbol}</MarketsIntentLink></td>
                <td colSpan={8} className="market-watchlist-missing">No data in the current snapshot. The ticker remains saved and will resolve when market data becomes available.</td>
                <td>—</td>
                <td><button type="button" className="market-watchlist-remove" onClick={() => removeSymbol(symbol)} aria-label={`Remove ${symbol} from ${activeList.name}`}><X size={13} /> Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <footer className="market-screen-footer market-watchlist-footer">
        <span>{activeList.symbols.length} symbols</span>
        <span>{persistence === 'server' ? 'Private server-backed' : persistence === 'loading' ? 'Migrating saved lists…' : 'Local fallback'}</span>
        <span>{universe.rows.length} equities searchable</span>
        <span>{feedLabel(universe.feed)} market snapshot</span>
      </footer>
    </section>
  )
}

function WatchlistRow({ row, onRemove }: { row: ScreenerRow; onRemove: (symbol: string) => void }) {
  return (
    <tr>
      <td><MarketsIntentLink className="market-symbol-button" href={`/markets/stocks/${row.symbol}`} scroll={false}>{row.symbol}</MarketsIntentLink></td>
      <td>{row.company}</td>
      <td>{formatPrice(row.price)}</td>
      <td className={row.dailyChange >= 0 ? 'market-positive' : 'market-negative'}>{formatPercent(row.dailyChange)}</td>
      <td>{formatVolume(row.volume)}</td>
      <td className={row.relativeVolume >= 1 ? 'market-positive' : ''}>{row.relativeVolume.toFixed(2)}×</td>
      <td><MarketSparkline values={row.range} label={`${row.symbol} intraday range`} /></td>
      <td>{formatPrice(row.fiftyDayAverage)}</td>
      <td>
        <div className="market-52-week-cell">
          <span>{row.fiftyTwoWeekPosition}%</span>
          <span className="market-52-week-track"><i style={{ left: `${row.fiftyTwoWeekPosition}%` }} /></span>
        </div>
      </td>
      <td>{formatMarketTime(row.asOf)}</td>
      <td>
        <div className="market-watchlist-row-actions">
          <MarketsIntentLink href={`/markets/stocks/${row.symbol}`} scroll={false}>Open</MarketsIntentLink>
          <button type="button" className="market-watchlist-remove" onClick={() => onRemove(row.symbol)} aria-label={`Remove ${row.symbol} from watchlist`}><X size={13} /> Remove</button>
        </div>
      </td>
    </tr>
  )
}
