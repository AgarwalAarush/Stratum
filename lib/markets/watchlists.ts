export const WATCHLIST_STORAGE_KEY = 'stratum:markets:watchlists:v1'

export interface MarketWatchlist {
  id: string
  name: string
  symbols: string[]
}

export interface MarketWatchlistState {
  version: 1
  activeListId: string
  lists: MarketWatchlist[]
}

const DEFAULT_SYMBOLS = ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL']
export const ENERGY_WATCHLIST_SYMBOLS = ['GRID', 'MLPX', 'NLR', 'PAVE', 'PIKA', 'RACK', 'URA', 'UTES', 'XLU']
const MAX_LISTS = 12
const MAX_SYMBOLS_PER_LIST = 100
const SYMBOL_PATTERN = /^[A-Z0-9.-]{1,10}$/

function normalizedSymbols(values: unknown): string[] {
  if (!Array.isArray(values)) return []
  return [...new Set(values
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim().toUpperCase())
    .filter((value) => SYMBOL_PATTERN.test(value)))]
    .slice(0, MAX_SYMBOLS_PER_LIST)
}

export function createDefaultWatchlistState(availableSymbols: string[]): MarketWatchlistState {
  const available = new Set(normalizedSymbols(availableSymbols))
  const preferred = DEFAULT_SYMBOLS.filter((symbol) => available.has(symbol))
  for (const symbol of available) {
    if (preferred.length >= 5) break
    if (!preferred.includes(symbol)) preferred.push(symbol)
  }

  return {
    version: 1,
    activeListId: 'energy',
    lists: [
      { id: 'energy', name: 'Energy', symbols: ENERGY_WATCHLIST_SYMBOLS },
      { id: 'core', name: 'Core', symbols: preferred },
    ],
  }
}

/**
 * A user-requested starter list should be added to existing workspaces too,
 * without overwriting the lists or the symbols that they have already saved.
 */
export function ensureEnergyWatchlist(state: MarketWatchlistState): MarketWatchlistState {
  if (state.lists.some((list) => list.id === 'energy' || list.name.trim().toLocaleLowerCase() === 'energy')) return state
  const energy = { id: 'energy', name: 'Energy', symbols: ENERGY_WATCHLIST_SYMBOLS }
  return { ...state, activeListId: energy.id, lists: [energy, ...state.lists].slice(0, MAX_LISTS) }
}

export function parseWatchlistState(value: unknown, fallback: MarketWatchlistState): MarketWatchlistState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback
  const record = value as Record<string, unknown>
  if (!Array.isArray(record.lists)) return fallback

  const lists = record.lists.flatMap((item): MarketWatchlist[] => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []
    const list = item as Record<string, unknown>
    if (typeof list.id !== 'string' || typeof list.name !== 'string') return []
    const id = list.id.trim().slice(0, 80)
    const name = list.name.trim().slice(0, 40)
    if (!id || !name) return []
    return [{ id, name, symbols: normalizedSymbols(list.symbols) }]
  }).slice(0, MAX_LISTS)

  if (lists.length === 0) return fallback
  const requestedActiveId = typeof record.activeListId === 'string' ? record.activeListId : ''
  const activeListId = lists.some((list) => list.id === requestedActiveId) ? requestedActiveId : lists[0]!.id
  return { version: 1, activeListId, lists }
}

export function updateWatchlist(
  state: MarketWatchlistState,
  listId: string,
  update: (list: MarketWatchlist) => MarketWatchlist,
): MarketWatchlistState {
  return {
    ...state,
    lists: state.lists.map((list) => list.id === listId ? update(list) : list),
  }
}

export function isValidWatchlistSymbol(symbol: string): boolean {
  return SYMBOL_PATTERN.test(symbol.trim().toUpperCase())
}
