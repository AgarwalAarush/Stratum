import { strFromU8, unzipSync } from 'fflate'
import type { MarketAsset } from '../markets/types.ts'
import { getSupabaseClient } from './supabase.ts'

export const SPY_HOLDINGS_URL = 'https://www.ssga.com/library-content/products/fund-data/etfs/us/holdings-daily-us-en-spy.xlsx'
export const MIN_SP500_ASSETS = 450
const UNIVERSE_CACHE_MS = 20 * 60 * 60 * 1_000
const SOURCE_NAME = 'state-street-spy-holdings'

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

export async function resolveMarketUniverse(
  assets: MarketAsset[],
  options: ResolveMarketUniverseOptions = {},
): Promise<MarketAsset[]> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')

  const now = options.now ?? new Date()
  const { data: persistedRows, error: persistedError } = await supabase
    .from('market_universe_members')
    .select('symbol,refreshed_at')
    .eq('universe', 'sp500')
    .eq('active', true)
  if (persistedError) throw new Error(`Unable to load the market universe: ${persistedError.message}`)

  const persisted = (persistedRows ?? []) as PersistedUniverseRow[]
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

  const { data: watchlistRows, error: watchlistError } = await supabase
    .from('market_watchlist_items')
    .select('symbol')
  if (watchlistError) throw new Error(`Unable to load watchlist symbols: ${watchlistError.message}`)

  const universe = selectMarketUniverseAssets(
    assets,
    sp500Symbols,
    (watchlistRows ?? []).map((row) => row.symbol),
  )
  if (universe.length < MIN_SP500_ASSETS) throw new Error(`Resolved market universe contains only ${universe.length} assets`)
  return universe
}
