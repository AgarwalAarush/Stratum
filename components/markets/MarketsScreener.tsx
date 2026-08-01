'use client'

import { CaretDown, CaretUp, Check, Funnel, PencilSimple, Plus, Trash, X } from '@phosphor-icons/react'
import { useRouter } from 'next/navigation'
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { MarketSparkline } from './MarketSparkline'
import { ScreenerConditionBuilder } from './ScreenerConditionBuilder'
import {
  DEFAULT_SCREENER_FILTERS,
  DEFAULT_SCREENER_QUERY,
  isScreenerReturnField,
  nextScreenerSort,
  SCREENER_RETURN_PERIODS,
} from '@/lib/markets/screener'
import {
  LEGACY_SAVED_SCREEN_STORAGE_KEY,
  parseSavedScreenerQuery,
  parseSavedScreenerScreens,
  SAVED_SCREENS_STORAGE_KEY,
  screenQueryFromCurrent,
} from '@/lib/markets/saved-screens'
import type {
  SavedScreenerQuery,
  SavedScreenerScreen,
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

function newLocalScreenId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? `local-${crypto.randomUUID()}`
    : `local-${Date.now()}`
}

function screenErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

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
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [savedScreens, setSavedScreens] = useState<SavedScreenerScreen[]>([])
  const [activeScreenId, setActiveScreenId] = useState<string | null>(null)
  const [screenDirty, setScreenDirty] = useState(false)
  const [screenEditor, setScreenEditor] = useState<'create' | 'rename' | null>(null)
  const [screenName, setScreenName] = useState('')
  const [screenSaving, setScreenSaving] = useState(false)
  const [screenDeleteArmed, setScreenDeleteArmed] = useState(false)
  const [screenNotice, setScreenNotice] = useState('')
  const [screenPersistence, setScreenPersistence] = useState<'loading' | 'server' | 'local'>('loading')
  const requestRef = useRef<AbortController | null>(null)
  const prefetchTimer = useRef<number | null>(null)
  const prefetchedStocks = useRef(new Set<string>())

  useEffect(() => () => {
    requestRef.current?.abort()
    if (prefetchTimer.current !== null) window.clearTimeout(prefetchTimer.current)
  }, [])

  useEffect(() => {
    let active = true
    const parseLocalScreens = () => {
      try {
        const stored = localStorage.getItem(SAVED_SCREENS_STORAGE_KEY)
        return stored ? parseSavedScreenerScreens(JSON.parse(stored)) : []
      } catch {
        return []
      }
    }
    const legacyScreen = (): SavedScreenerQuery | null => {
      try {
        const stored = localStorage.getItem(LEGACY_SAVED_SCREEN_STORAGE_KEY)
        return stored ? parseSavedScreenerQuery(JSON.parse(stored)) : null
      } catch {
        return null
      }
    }
    const hydrateScreens = async () => {
      const localScreens = parseLocalScreens()
      const legacy = legacyScreen()
      try {
        const result = await fetch('/api/markets/saved-screens')
        const payload = await result.json()
        if (!result.ok) throw new Error(payload?.error ?? 'Unable to load saved screens')
        let screens = Array.isArray(payload.screens) ? payload.screens as SavedScreenerScreen[] : []
        if (screens.length === 0 && legacy) {
          const migration = await fetch('/api/markets/saved-screens', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'create', name: 'Saved screen', query: legacy }),
          })
          const migrated = await migration.json()
          if (migration.ok && migrated.screen) {
            screens = [migrated.screen as SavedScreenerScreen]
            localStorage.removeItem(LEGACY_SAVED_SCREEN_STORAGE_KEY)
          }
        }
        if (!active) return
        setSavedScreens(screens)
        setScreenPersistence('server')
      } catch {
        if (!active) return
        setSavedScreens(localScreens)
        setScreenPersistence('local')
      }
    }
    void hydrateScreens()
    return () => { active = false }
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
    // Presets and saved screens are one mutually exclusive screen picker. A
    // preset is a fresh starting point, not an edit to whichever saved screen
    // happened to be selected before it.
    setActiveScreenId(null)
    setScreenDirty(false)
    setScreenDeleteArmed(false)
    setScreenEditor(null)
    setScreenNotice('')
    void execute({ preset: nextPreset, filters: next.filters, sort: next.sort, direction: next.direction, page: 1 })
  }

  const changeFilters = (nextFilters: ScreenerFilter[]) => {
    setFilters(nextFilters)
    setScreenDirty(Boolean(activeScreenId))
    void execute({ filters: nextFilters, page: 1 })
  }

  const resetScreen = () => {
    setPreset(DEFAULT_SCREENER_QUERY.preset)
    setFilters([...DEFAULT_SCREENER_FILTERS])
    setSort(DEFAULT_SCREENER_QUERY.sort)
    setDirection(DEFAULT_SCREENER_QUERY.direction)
    setActiveScreenId(null)
    setScreenDirty(false)
    setScreenDeleteArmed(false)
    setScreenEditor(null)
    setScreenNotice('')
    void execute(DEFAULT_SCREENER_QUERY)
  }

  const currentScreenQuery = (): SavedScreenerQuery => screenQueryFromCurrent({ preset, filters, sort, direction })

  const persistLocalScreens = (screens: SavedScreenerScreen[]) => {
    localStorage.setItem(SAVED_SCREENS_STORAGE_KEY, JSON.stringify({ version: 1, screens }))
  }

  const saveNewScreen = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const name = screenName.trim()
    if (!name || screenSaving) return
    setScreenSaving(true)
    setScreenNotice('')
    const query = currentScreenQuery()
    let didSave = false
    try {
      const response = await fetch('/api/markets/saved-screens', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', name, query }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload?.error ?? 'Unable to save screen')
      const screen = payload.screen as SavedScreenerScreen
      setSavedScreens((current) => [screen, ...current])
      setActiveScreenId(screen.id)
      setScreenPersistence('server')
      didSave = true
    } catch (error) {
      if (screenPersistence === 'server') {
        setScreenNotice(screenErrorMessage(error, 'Unable to save screen.'))
        return
      }
      const now = new Date().toISOString()
      const screen: SavedScreenerScreen = { id: newLocalScreenId(), name, query, createdAt: now, updatedAt: now }
      setSavedScreens((current) => {
        const next = [screen, ...current]
        persistLocalScreens(next)
        return next
      })
      setActiveScreenId(screen.id)
      setScreenPersistence('local')
      didSave = true
    } finally {
      setScreenSaving(false)
      if (didSave) {
        setScreenDirty(false)
        setScreenEditor(null)
        setScreenName('')
      }
    }
  }

  const saveCurrentScreen = async () => {
    const activeScreen = savedScreens.find((screen) => screen.id === activeScreenId)
    if (!activeScreen || screenSaving) return
    setScreenSaving(true)
    setScreenNotice('')
    const query = currentScreenQuery()
    let didSave = false
    try {
      const response = await fetch('/api/markets/saved-screens', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update', id: activeScreen.id, query }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload?.error ?? 'Unable to save screen')
      const updated = payload.screen as SavedScreenerScreen
      setSavedScreens((current) => current.map((screen) => screen.id === updated.id ? updated : screen))
      setScreenPersistence('server')
      didSave = true
    } catch (error) {
      if (screenPersistence === 'server' && !activeScreen.id.startsWith('local-')) {
        setScreenNotice(screenErrorMessage(error, 'Unable to update screen.'))
        return
      }
      const updated = { ...activeScreen, query, updatedAt: new Date().toISOString() }
      setSavedScreens((current) => {
        const next = current.map((screen) => screen.id === updated.id ? updated : screen)
        persistLocalScreens(next)
        return next
      })
      setScreenPersistence('local')
      didSave = true
    } finally {
      setScreenSaving(false)
      if (didSave) setScreenDirty(false)
    }
  }

  const renameScreen = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const activeScreen = savedScreens.find((screen) => screen.id === activeScreenId)
    const name = screenName.trim()
    if (!activeScreen || !name || screenSaving) return
    setScreenSaving(true)
    let didRename = false
    try {
      const response = await fetch('/api/markets/saved-screens', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update', id: activeScreen.id, name }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload?.error ?? 'Unable to rename screen')
      const updated = payload.screen as SavedScreenerScreen
      setSavedScreens((current) => current.map((screen) => screen.id === updated.id ? updated : screen))
      setScreenPersistence('server')
      didRename = true
    } catch (error) {
      if (screenPersistence === 'server' && !activeScreen.id.startsWith('local-')) {
        setScreenNotice(screenErrorMessage(error, 'Unable to rename screen.'))
        return
      }
      const updated = { ...activeScreen, name, updatedAt: new Date().toISOString() }
      setSavedScreens((current) => {
        const next = current.map((screen) => screen.id === updated.id ? updated : screen)
        persistLocalScreens(next)
        return next
      })
      setScreenPersistence('local')
      didRename = true
    } finally {
      setScreenSaving(false)
      if (didRename) {
        setScreenEditor(null)
        setScreenName('')
      }
    }
  }

  const applySavedScreen = (screen: SavedScreenerScreen) => {
    setPreset(screen.query.preset)
    setFilters(screen.query.filters)
    setSort(screen.query.sort)
    setDirection(screen.query.direction)
    setActiveScreenId(screen.id)
    setScreenDirty(false)
    setScreenDeleteArmed(false)
    setScreenEditor(null)
    setScreenNotice('')
    void execute({ ...screen.query, page: 1 })
  }

  const deleteCurrentScreen = async () => {
    const activeScreen = savedScreens.find((screen) => screen.id === activeScreenId)
    if (!activeScreen || screenSaving) return
    if (!screenDeleteArmed) {
      setScreenDeleteArmed(true)
      setScreenNotice(`Select delete again to remove ${activeScreen.name}.`)
      return
    }
    setScreenSaving(true)
    let didDelete = false
    try {
      const response = await fetch('/api/markets/saved-screens', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', id: activeScreen.id }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload?.error ?? 'Unable to delete screen')
      setScreenPersistence('server')
      didDelete = true
    } catch (error) {
      if (screenPersistence === 'server' && !activeScreen.id.startsWith('local-')) {
        setScreenNotice(screenErrorMessage(error, 'Unable to delete screen.'))
        return
      }
      setScreenPersistence('local')
      didDelete = true
    } finally {
      setScreenSaving(false)
      if (!didDelete) {
        setScreenDeleteArmed(false)
        return
      }
      setSavedScreens((current) => {
        const next = current.filter((screen) => screen.id !== activeScreen.id)
        persistLocalScreens(next)
        return next
      })
      setActiveScreenId(null)
      setScreenDeleteArmed(false)
      setScreenNotice('')
    }
  }

  const changeSort = (field: ScreenerSortField) => {
    const presetDefault = PRESET_QUERIES[preset]
    const next = nextScreenerSort(field, { sort, direction }, presetDefault)
    setSort(next.sort)
    setDirection(next.direction)
    setScreenDirty(Boolean(activeScreenId))
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
  const activeScreen = savedScreens.find((screen) => screen.id === activeScreenId) ?? null

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
          {activeScreen && (
            <>
              <button type="button" className="market-action-link" onClick={() => void saveCurrentScreen()} disabled={!screenDirty || screenSaving}>Save changes</button>
              <button type="button" className="market-action-link" onClick={() => { setScreenEditor('rename'); setScreenName(activeScreen.name); setScreenDeleteArmed(false); setScreenNotice('') }}><PencilSimple size={13} /> Rename</button>
              <button type="button" className={screenDeleteArmed ? 'market-action-link market-action-danger' : 'market-action-link'} onClick={() => void deleteCurrentScreen()}><Trash size={13} /> {screenDeleteArmed ? 'Confirm delete' : 'Delete'}</button>
            </>
          )}
          <span className="market-action-divider" aria-hidden="true" />
          <button type="button" className="market-action-link" onClick={() => { setScreenEditor('create'); setScreenName('') }}>
            <Plus size={13} aria-hidden="true" /> Save as new
          </button>
        </div>
      </div>

      {error && <p className="market-screen-error" role="alert">{error}</p>}

      <nav className="market-screen-tabs" aria-label="Screener screens">
        {PRESETS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={!activeScreenId && preset === item.id ? 'market-screen-tab-active' : ''}
            aria-current={!activeScreenId && preset === item.id ? 'page' : undefined}
            onClick={() => choosePreset(item.id)}
          >
            {item.label}
          </button>
        ))}
        <span className="market-screen-tab-divider" aria-hidden="true" />
        <span className="market-screen-tab-label" id="saved-screens-title">Your screens</span>
        {savedScreens.map((screen) => (
          <button
            key={screen.id}
            type="button"
            className={screen.id === activeScreenId ? 'market-screen-tab-active' : ''}
            aria-current={screen.id === activeScreenId ? 'page' : undefined}
            onClick={() => applySavedScreen(screen)}
          >
            {screen.name}
          </button>
        ))}
        <button type="button" className="market-screen-tab-new" onClick={() => { setScreenEditor('create'); setScreenName('') }}>
          <Plus size={13} aria-hidden="true" /> New screen
        </button>
      </nav>

      {screenEditor === 'create' && (
        <form className="market-saved-screen-form" onSubmit={saveNewScreen}>
          <label htmlFor="saved-screen-name">Name this screen</label>
          <input id="saved-screen-name" value={screenName} onChange={(event) => setScreenName(event.target.value)} maxLength={48} autoFocus placeholder="e.g. AI infrastructure pullbacks" />
          <button type="submit" disabled={screenSaving || !screenName.trim()}><Check size={14} /> Save screen</button>
          <button type="button" aria-label="Cancel new saved screen" onClick={() => { setScreenEditor(null); setScreenName('') }}><X size={14} /></button>
        </form>
      )}

      {activeScreen && screenEditor === 'rename' && (
        <form className="market-saved-screen-form market-saved-screen-rename" onSubmit={renameScreen}>
          <label htmlFor="saved-screen-rename">Rename screen</label>
          <input id="saved-screen-rename" value={screenName} onChange={(event) => setScreenName(event.target.value)} maxLength={48} autoFocus />
          <button type="submit" aria-label="Save screen name" disabled={screenSaving || !screenName.trim()}><Check size={14} /> Save</button>
          <button type="button" aria-label="Cancel rename" onClick={() => { setScreenEditor(null); setScreenName('') }}><X size={14} /></button>
        </form>
      )}

      {screenNotice && <p className="market-saved-screen-notice" aria-live="polite">{screenNotice}</p>}

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
