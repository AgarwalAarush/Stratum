import { calculateScreenerRow } from '../markets/calculations.ts'
import type { MarketAsset, MarketDailyBar, MarketFeed, ScreenerRow } from '../markets/types.ts'
import { getAlpacaClient, type AlpacaClient } from './alpaca.ts'
import { GICS_CONSTITUENTS_URL, parseGicsConstituents } from './market-leadership.ts'
import { getSupabaseClient } from './supabase.ts'

const DATABASE_BATCH_SIZE = 500
const DATABASE_PAGE_SIZE = 1_000
const MARKET_LOOKBACK_DAYS = 380
const INCREMENTAL_LOOKBACK_DAYS = 8
const HISTORY_QUERY_SYMBOL_BATCH_SIZE = 40
const HISTORY_CACHE_BARS_PER_SYMBOL = 300
const REQUIRED_HISTORY_BARS = 252

type SupabaseServiceClient = NonNullable<ReturnType<typeof getSupabaseClient>>

interface DailyBarRow {
  symbol: string
  trading_date: string
  open: number | string
  high: number | string
  low: number | string
  close: number | string
  volume: number | string
  trade_count: number | string | null
  vwap: number | string | null
  feed: Exclude<MarketFeed, 'illustrative'>
  source_as_of: string
}

let historyCacheFeed: Exclude<MarketFeed, 'illustrative'> | null = null
let historyBackfillDate: string | null = null
const historyCache = new Map<string, MarketDailyBar[]>()
const historyBackfilledSymbols = new Set<string>()
const historyRefreshDateByFeed = new Map<Exclude<MarketFeed, 'illustrative'>, string>()

function batches<T>(items: T[], size = DATABASE_BATCH_SIZE): T[][] {
  const result: T[][] = []
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size))
  return result
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function mergeMarketDailyBars(
  current: MarketDailyBar[],
  updates: MarketDailyBar[],
  maximumBars = HISTORY_CACHE_BARS_PER_SYMBOL,
): MarketDailyBar[] {
  const byDate = new Map(current.map((bar) => [bar.tradingDate, bar]))
  for (const bar of updates) byDate.set(bar.tradingDate, bar)
  return [...byDate.values()]
    .sort((left, right) => right.tradingDate.localeCompare(left.tradingDate))
    .slice(0, maximumBars)
}

export function appendMarketDailyBars(
  target: MarketDailyBar[],
  source: MarketDailyBar[],
): void {
  for (const bar of source) target.push(bar)
}

export function symbolsNeedingHistoryBackfill(
  symbols: string[],
  cache: ReadonlyMap<string, MarketDailyBar[]>,
  attemptedSymbols: ReadonlySet<string>,
): string[] {
  return symbols.filter((symbol) =>
    !attemptedSymbols.has(symbol) && (cache.get(symbol)?.length ?? 0) < REQUIRED_HISTORY_BARS)
}

function normalizeDailyBarRow(row: DailyBarRow): MarketDailyBar {
  return {
    symbol: row.symbol,
    tradingDate: row.trading_date,
    open: Number(row.open),
    high: Number(row.high),
    low: Number(row.low),
    close: Number(row.close),
    volume: Number(row.volume),
    tradeCount: row.trade_count === null ? null : Number(row.trade_count),
    vwap: row.vwap === null ? null : Number(row.vwap),
    feed: row.feed,
    asOf: row.source_as_of,
  }
}

async function loadPersistedDailyBars(
  supabase: SupabaseServiceClient,
  symbols: string[],
  feed: Exclude<MarketFeed, 'illustrative'>,
  start: string,
): Promise<MarketDailyBar[]> {
  const result: MarketDailyBar[] = []
  for (const symbolBatch of batches(symbols, HISTORY_QUERY_SYMBOL_BATCH_SIZE)) {
    for (let from = 0; ; from += DATABASE_PAGE_SIZE) {
      const { data, error } = await supabase
        .from('market_bars_daily')
        .select('symbol,trading_date,open,high,low,close,volume,trade_count,vwap,feed,source_as_of')
        .in('symbol', symbolBatch)
        .eq('feed', feed)
        .gte('trading_date', start)
        .order('symbol', { ascending: true })
        .order('trading_date', { ascending: false })
        .range(from, from + DATABASE_PAGE_SIZE - 1)
      if (error) throw new Error(`Unable to load persisted daily market bars: ${error.message}`)
      const page = (data ?? []) as DailyBarRow[]
      result.push(...page.map(normalizeDailyBarRow))
      if (page.length < DATABASE_PAGE_SIZE) break
    }
  }
  return result
}

async function persistDailyBars(
  supabase: SupabaseServiceClient,
  bars: MarketDailyBar[],
): Promise<void> {
  for (const batch of batches(bars)) {
    const { error } = await supabase.from('market_bars_daily').upsert(batch.map((bar) => ({
      symbol: bar.symbol,
      trading_date: bar.tradingDate,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume,
      trade_count: bar.tradeCount,
      vwap: bar.vwap,
      feed: bar.feed,
      source_as_of: bar.asOf,
    })), { onConflict: 'symbol,trading_date,feed' })
    if (error) throw new Error(`Unable to persist daily market bars: ${error.message}`)
  }
}

async function loadScreenerHistory(
  client: AlpacaClient,
  supabase: SupabaseServiceClient,
  symbols: string[],
  feed: Exclude<MarketFeed, 'illustrative'>,
  now: Date,
): Promise<{ bars: MarketDailyBar[]; feed: Exclude<MarketFeed, 'illustrative'>; fetchedBarCount: number }> {
  if (historyCacheFeed !== feed) {
    historyCache.clear()
    historyCacheFeed = feed
    historyBackfillDate = null
    historyBackfilledSymbols.clear()
  }

  const start = new Date(now)
  start.setUTCDate(start.getUTCDate() - MARKET_LOOKBACK_DAYS)
  const missingFromCache = symbols.filter((symbol) => !historyCache.has(symbol))
  if (missingFromCache.length > 0) {
    const persisted = await loadPersistedDailyBars(supabase, missingFromCache, feed, isoDate(start))
    const persistedBySymbol = new Map<string, MarketDailyBar[]>()
    for (const bar of persisted) {
      persistedBySymbol.set(bar.symbol, [...(persistedBySymbol.get(bar.symbol) ?? []), bar])
    }
    for (const symbol of missingFromCache) {
      historyCache.set(symbol, mergeMarketDailyBars([], persistedBySymbol.get(symbol) ?? []))
    }
  }

  const today = isoDate(now)
  if (historyBackfillDate !== today) {
    historyBackfillDate = today
    historyBackfilledSymbols.clear()
  }
  const historyRefreshDue = historyRefreshDateByFeed.get(feed) !== today
  const backfillSymbols = historyRefreshDue
    ? symbolsNeedingHistoryBackfill(symbols, historyCache, historyBackfilledSymbols)
    : []
  const fetched: MarketDailyBar[] = []
  let resultFeed = feed

  if (backfillSymbols.length > 0) {
    const backfill = await client.fetchDailyBars(backfillSymbols, isoDate(start), today, feed)
    appendMarketDailyBars(fetched, backfill.data)
    for (const symbol of backfillSymbols) historyBackfilledSymbols.add(symbol)
    resultFeed = backfill.feed
  }

  if (resultFeed === feed && historyRefreshDue && backfillSymbols.length < symbols.length) {
    const incrementalStart = new Date(now)
    incrementalStart.setUTCDate(incrementalStart.getUTCDate() - INCREMENTAL_LOOKBACK_DAYS)
    const incremental = await client.fetchDailyBars(symbols, isoDate(incrementalStart), today, feed)
    appendMarketDailyBars(fetched, incremental.data)
    resultFeed = incremental.feed
  }

  if (fetched.length > 0) await persistDailyBars(supabase, fetched)
  if (resultFeed !== feed) {
    historyCache.clear()
    historyCacheFeed = resultFeed
    historyBackfillDate = null
    historyBackfilledSymbols.clear()
    const fetchedBySymbol = new Map<string, MarketDailyBar[]>()
    for (const bar of fetched) {
      fetchedBySymbol.set(bar.symbol, [...(fetchedBySymbol.get(bar.symbol) ?? []), bar])
    }
    for (const symbol of symbols) {
      historyCache.set(symbol, mergeMarketDailyBars([], fetchedBySymbol.get(symbol) ?? []))
    }
  } else {
    const fetchedBySymbol = new Map<string, MarketDailyBar[]>()
    for (const bar of fetched) {
      fetchedBySymbol.set(bar.symbol, [...(fetchedBySymbol.get(bar.symbol) ?? []), bar])
    }
    for (const [symbol, updates] of fetchedBySymbol) {
      historyCache.set(symbol, mergeMarketDailyBars(historyCache.get(symbol) ?? [], updates))
    }
    historyRefreshDateByFeed.set(feed, today)
  }

  return {
    bars: symbols.flatMap((symbol) => historyCache.get(symbol) ?? []),
    feed: resultFeed,
    fetchedBarCount: fetched.length,
  }
}

export function newestTimestamp(rows: Array<{ asOf: string }>, fallback: string): string {
  if (rows.length === 0) return fallback
  return rows.reduce((latest, row) => row.asOf > latest ? row.asOf : latest, rows[0]!.asOf)
}

export interface MaterializeMarketsOptions {
  client?: AlpacaClient
  now?: Date
  symbols?: string[]
  assets?: MarketAsset[]
  fetchImpl?: typeof fetch
}

async function loadGicsTaxonomy(symbols: string[], fetchImpl: typeof fetch = fetch): Promise<Map<string, { sector: string; subIndustry: string }>> {
  try {
    const response = await fetchImpl(GICS_CONSTITUENTS_URL, {
      headers: { 'User-Agent': 'Stratum/0.4 (+market-structure-worker)' },
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) return new Map()
    const requested = new Set(symbols)
    return new Map(parseGicsConstituents(await response.text())
      .filter((company) => requested.has(company.symbol))
      .map((company) => [company.symbol, { sector: company.sector, subIndustry: company.subIndustry }]))
  } catch {
    return new Map()
  }
}

export async function syncAlpacaAssets(client: AlpacaClient = getAlpacaClient()!, now = new Date()): Promise<MarketAsset[]> {
  const supabase = getSupabaseClient()
  if (!client) throw new Error('Alpaca credentials are not configured')
  if (!supabase) throw new Error('Supabase service credentials are not configured')

  const assets = (await client.fetchAssets()).filter((asset) => asset.active && asset.tradable)
  if (assets.length === 0) throw new Error('Alpaca returned no eligible US equity assets')

  for (const batch of batches(assets)) {
    const { error } = await supabase.from('market_assets').upsert(batch.map((asset) => ({
      symbol: asset.symbol,
      name: asset.name,
      exchange: asset.exchange,
      asset_class: asset.assetClass,
      status: asset.active ? 'active' : 'inactive',
      tradable: asset.tradable,
      active: asset.active,
      source: 'alpaca',
      source_as_of: now.toISOString(),
      raw: {},
      updated_at: now.toISOString(),
    })), { onConflict: 'symbol' })
    if (error) throw new Error(`Unable to persist market assets: ${error.message}`)
  }
  return assets
}

export async function fetchPersistedMarketAssets(): Promise<MarketAsset[]> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const rows: Array<{
    symbol: string
    name: string
    exchange: string
    asset_class: string
    tradable: boolean
    active: boolean
  }> = []

  for (let page = 0; ; page += 1) {
    const from = page * DATABASE_PAGE_SIZE
    const { data, error } = await supabase
      .from('market_assets')
      .select('symbol,name,exchange,asset_class,tradable,active')
      .eq('active', true)
      .eq('tradable', true)
      .order('symbol', { ascending: true })
      .range(from, from + DATABASE_PAGE_SIZE - 1)
    if (error) throw new Error(`Unable to load market assets: ${error.message}`)
    rows.push(...(data ?? []))
    if ((data ?? []).length < DATABASE_PAGE_SIZE) break
  }

  return rows.map((asset) => ({
    symbol: asset.symbol,
    name: asset.name,
    exchange: asset.exchange,
    assetClass: 'us_equity',
    tradable: asset.tradable,
    active: asset.active,
  }))
}

export interface MaterializeMarketsResult {
  snapshotId: string
  feed: Exclude<MarketFeed, 'illustrative'>
  rowCount: number
  dataAsOf: string
  fetchedBarCount: number
}

export async function materializeAlpacaScreener(options: MaterializeMarketsOptions = {}): Promise<MaterializeMarketsResult> {
  const client = options.client ?? getAlpacaClient()
  const supabase = getSupabaseClient()
  if (!client) throw new Error('Alpaca credentials are not configured')
  if (!supabase) throw new Error('Supabase service credentials are not configured')

  const now = options.now ?? new Date()
  const allAssets = options.assets ?? await syncAlpacaAssets(client, now)
  const requestedSymbols = options.symbols ? new Set(options.symbols.map((symbol) => symbol.toUpperCase())) : null
  const assets = allAssets.filter((asset) => asset.active && asset.tradable && (!requestedSymbols || requestedSymbols.has(asset.symbol)))
  if (assets.length === 0) throw new Error('No eligible US equity assets are available')

  const symbols = assets.map((asset) => asset.symbol)
  const taxonomyBySymbol = await loadGicsTaxonomy(symbols, options.fetchImpl)
  let snapshotsResult = await client.fetchSnapshots(symbols)
  let feed = snapshotsResult.feed
  let historyResult = await loadScreenerHistory(client, supabase, symbols, feed, now)
  if (historyResult.feed !== feed) {
    snapshotsResult = await client.fetchSnapshots(symbols, historyResult.feed)
    feed = snapshotsResult.feed
    historyResult = await loadScreenerHistory(client, supabase, symbols, feed, now)
  }
  if (historyResult.feed !== feed) throw new Error(`Alpaca returned inconsistent feeds: ${feed} and ${historyResult.feed}`)

  const dataAsOf = newestTimestamp(snapshotsResult.data, now.toISOString())
  const { data: snapshotRecord, error: snapshotError } = await supabase
    .from('market_snapshots')
    .insert({ feed, status: 'building', data_as_of: dataAsOf })
    .select('id')
    .single()
  if (snapshotError || !snapshotRecord) throw new Error(`Unable to create market snapshot: ${snapshotError?.message ?? 'unknown error'}`)

  try {
    const assetsBySymbol = new Map<string, MarketAsset>(assets.map((asset) => [asset.symbol, asset]))
    const barsBySymbol = new Map<string, MarketDailyBar[]>()
    for (const bar of historyResult.bars) barsBySymbol.set(bar.symbol, [...(barsBySymbol.get(bar.symbol) ?? []), bar])

    const rows: ScreenerRow[] = snapshotsResult.data.flatMap((snapshot) => {
      const asset = assetsBySymbol.get(snapshot.symbol)
      if (!asset) return []
      const row = calculateScreenerRow(asset, snapshot, barsBySymbol.get(snapshot.symbol) ?? [])
      if (!row) return []
      const classification = taxonomyBySymbol.get(row.symbol)
      return [{
        ...row,
        sector: classification?.sector ?? 'Unclassified',
        subIndustry: classification?.subIndustry ?? 'Unclassified',
      }]
    })
    if (rows.length === 0) throw new Error('No screener rows had sufficient market history')

    for (const batch of batches(rows)) {
      const { error } = await supabase.from('screener_rows').insert(batch.map((row) => ({
        snapshot_id: snapshotRecord.id,
        symbol: row.symbol,
        company: row.company,
        price: row.price,
        daily_change: row.dailyChange,
        return_5d: row.return5d,
        return_30d: row.return30d,
        return_90d: row.return90d,
        return_180d: row.return180d,
        return_ytd: row.returnYtd,
        return_1y: row.return1y,
        gap: row.gap,
        volume: row.volume,
        relative_volume: row.relativeVolume,
        range_values: row.range,
        fifty_day_average: row.fiftyDayAverage,
        fifty_two_week_position: row.fiftyTwoWeekPosition,
        exchange: row.exchange,
        sector: row.sector,
        sub_industry: row.subIndustry,
        tradable: row.tradable,
        data_as_of: row.asOf,
      })))
      if (error) throw new Error(`Unable to persist screener rows: ${error.message}`)
    }

    const { error: publishError } = await supabase.rpc('publish_screener_snapshot', { p_snapshot_id: snapshotRecord.id })
    if (publishError) throw new Error(`Unable to publish market snapshot: ${publishError.message}`)

    return {
      snapshotId: snapshotRecord.id,
      feed,
      rowCount: rows.length,
      dataAsOf,
      fetchedBarCount: historyResult.fetchedBarCount,
    }
  } catch (error) {
    await supabase.from('market_snapshots').update({
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    }).eq('id', snapshotRecord.id)
    throw error
  }
}
