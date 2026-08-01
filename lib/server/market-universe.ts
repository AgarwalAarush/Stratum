import { strFromU8, unzipSync } from 'fflate'
import {
  EXPANDED_UNIVERSE_NAME,
  MARKET_THEME_SYMBOLS,
  MIN_EXPANDED_UNIVERSE_ASSETS,
  isExpandedUniverseListing,
  selectExpandedUniverseAssets,
} from '../markets/investable-universe.ts'
import type { MarketAsset } from '../markets/types.ts'
import type { AlpacaClient } from './alpaca.ts'
import { getSupabaseClient } from './supabase.ts'

export const SPY_HOLDINGS_URL = 'https://www.ssga.com/library-content/products/fund-data/etfs/us/holdings-daily-us-en-spy.xlsx'
export const IWM_HOLDINGS_URL = 'https://www.ishares.com/us/products/239710/ishares-russell-2000-etf/latest-holdings.csv'
export const MIN_SP500_ASSETS = 450
export const MIN_RUSSELL_2000_ASSETS = 1_800
export const RUSSELL_2000_UNIVERSE_NAME = 'russell-2000'
export const SEARCH_COVERAGE_UNIVERSE_NAME = 'search-coverage'
export const MARKET_BENCHMARK_SYMBOLS = ['SPY', 'QQQ', 'IWM', 'TLT', 'UUP', 'USO'] as const
const UNIVERSE_CACHE_MS = 20 * 60 * 60 * 1_000
const DATABASE_PAGE_SIZE = 1_000
const SOURCE_NAME = 'state-street-spy-holdings'
const RUSSELL_SOURCE_NAME = 'blackrock-ishares-iwm-holdings'
const EXPANDED_SOURCE_NAME = 'alpaca-liquidity-and-stratum-themes'

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

function sharedStrings(xml: string): string[] {
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((match) =>
    decodeXml([...match[1]!.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)]
      .map((text) => text[1] ?? '')
      .join('')),
  )
}

export function parseSpyHoldingsWorkbook(workbook: ArrayBuffer | Uint8Array): string[] {
  const archive = unzipSync(workbook instanceof Uint8Array ? workbook : new Uint8Array(workbook))
  const stringsFile = archive['xl/sharedStrings.xml']
  const sheetFile = archive['xl/worksheets/sheet1.xml']
  if (!stringsFile || !sheetFile) throw new Error('State Street holdings workbook is missing its primary worksheet')

  const strings = sharedStrings(strFromU8(stringsFile))
  const sheet = strFromU8(sheetFile)
  const candidates: Array<{ row: number; symbol: string }> = []

  for (const row of sheet.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const rowNumber = Number(row[1]!.match(/\br="(\d+)"/)?.[1] ?? 0)
    for (const cell of row[2]!.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attributes = cell[1] ?? ''
      if (!/\br="B\d+"/.test(attributes) || !/\bt="s"/.test(attributes)) continue
      const value = cell[2]!.match(/<v>(\d+)<\/v>/)?.[1]
      const symbol = value ? strings[Number(value)]?.trim().toUpperCase() : undefined
      if (symbol && /^[A-Z0-9][A-Z0-9.-]{0,11}$/.test(symbol)) candidates.push({ row: rowNumber, symbol })
    }
  }

  const headerRow = candidates.find((candidate) => candidate.symbol === 'TICKER')?.row ?? 0
  const symbols = new Set(candidates
    .filter((candidate) => candidate.row > headerRow && candidate.symbol !== 'TICKER')
    .map((candidate) => candidate.symbol))

  if (symbols.size < MIN_SP500_ASSETS) {
    throw new Error(`State Street holdings workbook contained only ${symbols.size} eligible symbols`)
  }
  return [...symbols]
}

function parseCsvRows(value: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]!
    if (quoted) {
      if (character === '"' && value[index + 1] === '"') {
        field += '"'
        index += 1
      } else if (character === '"') {
        quoted = false
      } else {
        field += character
      }
      continue
    }
    if (character === '"') {
      quoted = true
    } else if (character === ',') {
      row.push(field)
      field = ''
    } else if (character === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (character !== '\r') {
      field += character
    }
  }
  if (field || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

function holdingsDate(value: string): string {
  const match = value.trim().match(/^([A-Z][a-z]{2}) (\d{1,2}), (\d{4})$/)
  if (!match) throw new Error(`iShares IWM holdings date is invalid: ${value}`)
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].indexOf(match[1]!)
  if (month < 0) throw new Error(`iShares IWM holdings month is invalid: ${value}`)
  return new Date(Date.UTC(Number(match[3]), month, Number(match[2]))).toISOString()
}

export function parseIwmHoldingsCsv(value: string): { symbols: string[]; sourceAsOf: string } {
  const rows = parseCsvRows(value)
  const asOfRow = rows.find((row) => row[0]?.trim() === 'Fund Holdings as of')
  const headerIndex = rows.findIndex((row) =>
    row[0]?.trim() === 'Ticker'
    && row.includes('Asset Class'))
  if (!asOfRow?.[1] || headerIndex < 0) throw new Error('iShares IWM holdings CSV is missing metadata or headers')

  const header = rows[headerIndex]!
  const tickerIndex = header.indexOf('Ticker')
  const assetClassIndex = header.indexOf('Asset Class')
  const symbols = new Set(rows.slice(headerIndex + 1).flatMap((row) => {
    if (row[assetClassIndex]?.trim().toLowerCase() !== 'equity') return []
    const symbol = row[tickerIndex]?.trim().toUpperCase() ?? ''
    return /^[A-Z0-9][A-Z0-9.-]{0,11}$/.test(symbol) ? [symbol] : []
  }))
  if (symbols.size < MIN_RUSSELL_2000_ASSETS) {
    throw new Error(`iShares IWM holdings CSV contained only ${symbols.size} eligible symbols`)
  }
  return {
    symbols: [...symbols],
    sourceAsOf: holdingsDate(asOfRow[1]),
  }
}

export function selectMarketUniverseAssets(
  assets: MarketAsset[],
  sp500Symbols: Iterable<string>,
  watchlistSymbols: Iterable<string>,
): MarketAsset[] {
  const requested = new Set([...sp500Symbols, ...watchlistSymbols].map((symbol) => symbol.toUpperCase()))
  return assets.filter((asset) => asset.active && asset.tradable && requested.has(asset.symbol.toUpperCase()))
}

interface ResolveMarketUniverseOptions {
  fetchImpl?: typeof fetch
  forceRefresh?: boolean
  now?: Date
}

interface PersistedUniverseRow {
  symbol: string
  refreshed_at: string
}

type SupabaseServiceClient = NonNullable<ReturnType<typeof getSupabaseClient>>

async function fetchOfficialSp500Symbols(fetchImpl: typeof fetch): Promise<{ symbols: string[]; sourceAsOf: string }> {
  const response = await fetchImpl(SPY_HOLDINGS_URL, {
    headers: { 'User-Agent': 'Stratum Markets/1.0 (private market-data worker)' },
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) throw new Error(`State Street holdings request failed with ${response.status}`)
  const symbols = parseSpyHoldingsWorkbook(await response.arrayBuffer())
  const modified = response.headers.get('last-modified')
  return { symbols, sourceAsOf: modified ? new Date(modified).toISOString() : new Date().toISOString() }
}

async function fetchRussell2000Symbols(fetchImpl: typeof fetch): Promise<{ symbols: string[]; sourceAsOf: string }> {
  const response = await fetchImpl(IWM_HOLDINGS_URL, {
    headers: {
      Accept: 'text/csv',
      'User-Agent': 'Stratum Markets/1.0 (private market-data worker)',
    },
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) throw new Error(`iShares IWM holdings request failed with ${response.status}`)
  return parseIwmHoldingsCsv(await response.text())
}

async function loadPersistedUniverse(
  supabase: SupabaseServiceClient,
  universe: string,
): Promise<PersistedUniverseRow[]> {
  const rows: PersistedUniverseRow[] = []
  for (let from = 0; ; from += DATABASE_PAGE_SIZE) {
    const { data, error } = await supabase
      .from('market_universe_members')
      .select('symbol,refreshed_at')
      .eq('universe', universe)
      .eq('active', true)
      .range(from, from + DATABASE_PAGE_SIZE - 1)
    if (error) throw new Error(`Unable to load the ${universe} market universe: ${error.message}`)
    const page = (data ?? []) as PersistedUniverseRow[]
    rows.push(...page)
    if (page.length < DATABASE_PAGE_SIZE) break
  }
  return rows
}

async function resolveSp500Symbols(
  assets: MarketAsset[],
  supabase: SupabaseServiceClient,
  options: ResolveMarketUniverseOptions,
): Promise<string[]> {
  const now = options.now ?? new Date()
  const persisted = await loadPersistedUniverse(supabase, 'sp500')
  const newestRefresh = persisted.reduce((latest, row) => row.refreshed_at > latest ? row.refreshed_at : latest, '')
  const cacheFresh = newestRefresh !== '' && now.getTime() - new Date(newestRefresh).getTime() < UNIVERSE_CACHE_MS
  let sp500Symbols = persisted.map((row) => row.symbol)

  if (options.forceRefresh || !cacheFresh || sp500Symbols.length < MIN_SP500_ASSETS) {
    try {
      const official = await fetchOfficialSp500Symbols(options.fetchImpl ?? fetch)
      const eligible = selectMarketUniverseAssets(assets, official.symbols, []).map((asset) => asset.symbol)
      if (eligible.length < MIN_SP500_ASSETS) {
        throw new Error(`Only ${eligible.length} official S&P 500 holdings matched active Alpaca assets`)
      }
      const { error } = await supabase.rpc('replace_market_universe', {
        p_universe: 'sp500',
        p_symbols: eligible,
        p_source: SOURCE_NAME,
        p_source_as_of: official.sourceAsOf,
      })
      if (error) throw new Error(`Unable to persist the S&P 500 universe: ${error.message}`)
      sp500Symbols = eligible
    } catch (error) {
      if (sp500Symbols.length < MIN_SP500_ASSETS) throw error
    }
  }
  return sp500Symbols
}

async function resolveRussell2000Symbols(
  assets: MarketAsset[],
  supabase: SupabaseServiceClient,
  options: ResolveMarketUniverseOptions,
): Promise<string[]> {
  const now = options.now ?? new Date()
  const persisted = await loadPersistedUniverse(supabase, RUSSELL_2000_UNIVERSE_NAME)
  const newestRefresh = persisted.reduce((latest, row) => row.refreshed_at > latest ? row.refreshed_at : latest, '')
  const cacheFresh = newestRefresh !== '' && now.getTime() - new Date(newestRefresh).getTime() < UNIVERSE_CACHE_MS
  let russellSymbols = persisted.map((row) => row.symbol)

  if (options.forceRefresh || !cacheFresh || russellSymbols.length < MIN_RUSSELL_2000_ASSETS) {
    try {
      const holdings = await fetchRussell2000Symbols(options.fetchImpl ?? fetch)
      const eligible = selectMarketUniverseAssets(assets, holdings.symbols, []).map((asset) => asset.symbol)
      if (eligible.length < MIN_RUSSELL_2000_ASSETS) {
        throw new Error(`Only ${eligible.length} IWM holdings matched active Alpaca assets`)
      }
      const { error } = await supabase.rpc('replace_market_universe', {
        p_universe: RUSSELL_2000_UNIVERSE_NAME,
        p_symbols: eligible,
        p_source: RUSSELL_SOURCE_NAME,
        p_source_as_of: holdings.sourceAsOf,
      })
      if (error) throw new Error(`Unable to persist the Russell 2000 universe: ${error.message}`)
      russellSymbols = eligible
    } catch (error) {
      if (russellSymbols.length < MIN_RUSSELL_2000_ASSETS) throw error
    }
  }
  return russellSymbols
}

async function loadTrackedSymbols(supabase: SupabaseServiceClient): Promise<string[]> {
  const [
    { data: watchlistRows, error: watchlistError },
    { data: positionRows, error: positionError },
    { data: portfolioTransactionRows, error: portfolioTransactionError },
    { data: thesisRows, error: thesisError },
    { data: coverageRows, error: coverageError },
  ] = await Promise.all([
    supabase.from('market_watchlist_items').select('symbol'),
    supabase.from('manual_positions').select('symbol'),
    supabase.from('portfolio_transactions').select('symbol,action').not('symbol', 'is', null),
    supabase.from('investment_theses').select('symbol')
      .eq('entity_type', 'stock').eq('status', 'accepted').not('symbol', 'is', null),
    supabase.from('market_universe_members').select('symbol')
      .eq('universe', SEARCH_COVERAGE_UNIVERSE_NAME).eq('active', true),
  ])
  if (watchlistError || positionError || portfolioTransactionError || thesisError || coverageError) {
    throw new Error(`Unable to load tracked symbols: ${watchlistError?.message ?? positionError?.message ?? portfolioTransactionError?.message ?? thesisError?.message ?? coverageError?.message}`)
  }
  return [...new Set([
    ...(watchlistRows ?? []).map((row) => row.symbol),
    ...(positionRows ?? []).map((row) => row.symbol),
    ...(portfolioTransactionRows ?? []).flatMap((row) => typeof row.symbol === 'string' && (row.action === 'buy' || row.action === 'position_import') ? [row.symbol] : []),
    ...(thesisRows ?? []).flatMap((row) => typeof row.symbol === 'string' ? [row.symbol] : []),
    ...(coverageRows ?? []).map((row) => row.symbol),
  ])]
}

/** Records an eligible stock as durable priority coverage without changing a user's watchlist. */
export async function requestMarketCoverage(symbolInput: string): Promise<boolean> {
  const symbol = symbolInput.trim().toUpperCase()
  if (!/^[A-Z][A-Z0-9.-]{0,11}$/.test(symbol)) return false
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const { data: asset, error: assetError } = await supabase
    .from('market_assets')
    .select('symbol')
    .eq('symbol', symbol)
    .eq('active', true)
    .eq('tradable', true)
    .maybeSingle()
  if (assetError) throw new Error(`Unable to verify ${symbol}: ${assetError.message}`)
  if (!asset) return false
  const requestedAt = new Date().toISOString()
  const { error } = await supabase.from('market_universe_members').upsert({
    universe: SEARCH_COVERAGE_UNIVERSE_NAME,
    symbol,
    source: 'stock-search',
    source_as_of: requestedAt,
    active: true,
    refreshed_at: requestedAt,
  }, { onConflict: 'universe,symbol' })
  if (error) throw new Error(`Unable to request market coverage for ${symbol}: ${error.message}`)
  return true
}

export async function resolveMarketUniverse(
  assets: MarketAsset[],
  options: ResolveMarketUniverseOptions = {},
): Promise<MarketAsset[]> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const [sp500Symbols, russell2000Symbols, expandedRows, trackedSymbols] = await Promise.all([
    resolveSp500Symbols(assets, supabase, options),
    resolveRussell2000Symbols(assets, supabase, options),
    loadPersistedUniverse(supabase, EXPANDED_UNIVERSE_NAME),
    loadTrackedSymbols(supabase),
  ])
  const expandedSymbols = expandedRows.map((row) => row.symbol)
  const baseSymbols = expandedSymbols.length >= MIN_EXPANDED_UNIVERSE_ASSETS
    ? expandedSymbols
    : [...sp500Symbols, ...russell2000Symbols]

  const universe = selectMarketUniverseAssets(
    assets,
    baseSymbols,
    [
      ...trackedSymbols,
      ...MARKET_THEME_SYMBOLS,
      ...MARKET_BENCHMARK_SYMBOLS,
    ],
  )
  if (universe.length < MIN_SP500_ASSETS) throw new Error(`Resolved market universe contains only ${universe.length} assets`)
  return universe
}

export interface RefreshExpandedUniverseResult {
  assets: MarketAsset[]
  eligibleListingCount: number
  selectedCount: number
  feed: string
}

export async function refreshExpandedMarketUniverse(
  assets: MarketAsset[],
  client: AlpacaClient,
  options: ResolveMarketUniverseOptions = {},
): Promise<RefreshExpandedUniverseResult> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const [sp500Symbols, russell2000Symbols, trackedSymbols] = await Promise.all([
    resolveSp500Symbols(assets, supabase, options),
    resolveRussell2000Symbols(assets, supabase, options),
    loadTrackedSymbols(supabase),
  ])
  const eligibleListings = assets.filter(isExpandedUniverseListing)
  const snapshots = await client.fetchSnapshots(eligibleListings.map((asset) => asset.symbol))
  const selected = selectExpandedUniverseAssets(
    assets,
    snapshots.data,
    [
      ...sp500Symbols,
      ...russell2000Symbols,
      ...trackedSymbols,
      ...MARKET_THEME_SYMBOLS,
      ...MARKET_BENCHMARK_SYMBOLS,
    ],
  )
  if (selected.length < MIN_EXPANDED_UNIVERSE_ASSETS) {
    throw new Error(`Expanded investable universe contains only ${selected.length} assets`)
  }
  const sourceAsOf = options.now?.toISOString() ?? new Date().toISOString()
  const { error } = await supabase.rpc('replace_market_universe', {
    p_universe: EXPANDED_UNIVERSE_NAME,
    p_symbols: selected.map((asset) => asset.symbol),
    p_source: EXPANDED_SOURCE_NAME,
    p_source_as_of: sourceAsOf,
  })
  if (error) throw new Error(`Unable to persist the expanded market universe: ${error.message}`)
  return {
    assets: selected,
    eligibleListingCount: eligibleListings.length,
    selectedCount: selected.length,
    feed: snapshots.feed,
  }
}
