import { lastCompletedSession, nextCalendarDate } from '../markets/market-sessions.ts'
import { calculateScreenerRowFromMetrics, type CachedScreenerHistory, type ScreenerHistoryMetrics } from '../markets/calculations.ts'
import type { MarketAsset, MarketDailyBar, MarketFeed, ScreenerRow } from '../markets/types.ts'
import { getAlpacaClient, type AlpacaClient } from './alpaca.ts'
import { GICS_CONSTITUENTS_URL, parseGicsConstituents } from './market-leadership.ts'
import { getSupabaseClient } from './supabase.ts'

const DATABASE_BATCH_SIZE = 500
const DATABASE_PAGE_SIZE = 1_000
const MARKET_LOOKBACK_DAYS = 380
const HISTORY_CACHE_BARS_PER_SYMBOL = 300
const REQUIRED_HISTORY_BARS = 252

type SupabaseServiceClient = NonNullable<ReturnType<typeof getSupabaseClient>>

interface ScreenerHistoryMetricRow {
  symbol: string
  history_through: string | null
  bar_count: number | string
  average_volume: number | string | null
  fifty_day_average: number | string | null
  year_low: number | string | null
  year_high: number | string | null
  range_values: Array<number | string> | null
  close_5d: number | string | null
  close_30d: number | string | null
  close_90d: number | string | null
  close_180d: number | string | null
  close_ytd: number | string | null
  close_1y: number | string | null
}

interface CachedScreenerHistoryRow {
  symbol: string
  price: number | string
  return_5d: number | string | null
  return_30d: number | string | null
  return_90d: number | string | null
  return_180d: number | string | null
  return_ytd: number | string | null
  return_1y: number | string | null
  relative_volume: number | string
  range_values: Array<number | string> | null
  fifty_day_average: number | string
  fifty_two_week_position: number | string
}


function batches<T>(items: T[], size = DATABASE_BATCH_SIZE): T[][] {
  const result: T[][] = []
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size))
  return result
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function newYorkDate(timestamp: string): string {
  const date = new Date(timestamp)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

export function finiteMetric(value: number | string | null | undefined): number | null {
  if (value == null || value === '') return null
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : null
}

export async function loadScreenerHistoryMetrics(
  supabase: SupabaseServiceClient,
  symbols: string[],
  feed: Exclude<MarketFeed, 'illustrative'>,
  asOf: string,
): Promise<Map<string, ScreenerHistoryMetrics>> {
  const { data, error } = await supabase.rpc('screener_history_metrics_v2', {
    p_symbols: symbols,
    p_feed: feed,
    p_as_of: newYorkDate(asOf),
  })
  if (error) throw new Error(`Unable to calculate persisted screener history metrics: ${error.message}`)
  return new Map(((data ?? []) as ScreenerHistoryMetricRow[]).flatMap((row) => {
    const barCount = Number(row.bar_count)
    const averageVolume = finiteMetric(row.average_volume)
    const fiftyDayAverage = finiteMetric(row.fifty_day_average)
    const yearLow = finiteMetric(row.year_low)
    const yearHigh = finiteMetric(row.year_high)
    if (!row.symbol || !Number.isFinite(barCount) || averageVolume === null || fiftyDayAverage === null || yearLow === null || yearHigh === null) return []
    const metric: ScreenerHistoryMetrics = {
      symbol: row.symbol,
      historyThrough: row.history_through,
      barCount,
      averageVolume,
      fiftyDayAverage,
      yearLow,
      yearHigh,
      range: (row.range_values ?? []).map(finiteMetric).filter((value): value is number => value !== null),
      close5d: finiteMetric(row.close_5d),
      close30d: finiteMetric(row.close_30d),
      close90d: finiteMetric(row.close_90d),
      close180d: finiteMetric(row.close_180d),
      closeYtd: finiteMetric(row.close_ytd),
      close1y: finiteMetric(row.close_1y),
    }
    return [[metric.symbol, metric] as const]
  }))
}

export async function fillScreenerHistoryGaps(
  supabase: SupabaseServiceClient,
  symbols: string[],
  feed: Exclude<MarketFeed, 'illustrative'>,
  asOf: string,
  metrics: Map<string, ScreenerHistoryMetrics>,
  cached: ReadonlyMap<string, CachedScreenerHistory>,
): Promise<void> {
  const missing = [...new Set(symbols)].filter(symbol =>
    (metrics.get(symbol)?.barCount ?? 0) < 50 && !cached.has(symbol))
  // The archive fallback can predate newly required constituents. Resolve
  // just those gaps in smaller reductions instead of silently dropping them.
  for (const group of batches(missing, 10)) {
    const recovered = await loadScreenerHistoryMetrics(supabase, group, feed, asOf)
    for (const [symbol, value] of recovered) metrics.set(symbol, value)
  }
}

async function loadCachedScreenerHistory(
  supabase: SupabaseServiceClient,
  feed: Exclude<MarketFeed, 'illustrative'>,
): Promise<Map<string, CachedScreenerHistory>> {
  const { data: snapshot, error: snapshotError } = await supabase
    .from('market_snapshots')
    .select('id')
    .eq('status', 'complete')
    .eq('feed', feed)
    .eq('is_latest', true)
    .maybeSingle()
  if (snapshotError) throw new Error(`Unable to load cached screener snapshot: ${snapshotError.message}`)
  if (!snapshot) return new Map()

  const rows: CachedScreenerHistoryRow[] = []
  for (let from = 0; ; from += DATABASE_PAGE_SIZE) {
    const { data, error } = await supabase
      .from('screener_rows')
      .select('symbol,price,return_5d,return_30d,return_90d,return_180d,return_ytd,return_1y,relative_volume,range_values,fifty_day_average,fifty_two_week_position')
      .eq('snapshot_id', snapshot.id)
      .order('symbol', { ascending: true })
      .range(from, from + DATABASE_PAGE_SIZE - 1)
    if (error) throw new Error(`Unable to load cached screener rows: ${error.message}`)
    const page = (data ?? []) as CachedScreenerHistoryRow[]
    rows.push(...page)
    if (page.length < DATABASE_PAGE_SIZE) break
  }
  return new Map(rows.flatMap((row) => {
    const price = finiteMetric(row.price)
    const relativeVolume = finiteMetric(row.relative_volume)
    const fiftyDayAverage = finiteMetric(row.fifty_day_average)
    const fiftyTwoWeekPosition = finiteMetric(row.fifty_two_week_position)
    if (!row.symbol || price === null || relativeVolume === null || fiftyDayAverage === null || fiftyTwoWeekPosition === null) return []
    const history: CachedScreenerHistory = {
      symbol: row.symbol, price, relativeVolume, fiftyDayAverage, fiftyTwoWeekPosition,
      range: (row.range_values ?? []).map(finiteMetric).filter((value): value is number => value !== null),
      return5d: finiteMetric(row.return_5d), return30d: finiteMetric(row.return_30d),
      return90d: finiteMetric(row.return_90d), return180d: finiteMetric(row.return_180d),
      returnYtd: finiteMetric(row.return_ytd), return1y: finiteMetric(row.return_1y),
    }
    return [[history.symbol, history] as const]
  }))
}

function hasUsableScreenerHistory(metrics: ReadonlyMap<string, ScreenerHistoryMetrics>, symbols: string[]): boolean {
  return symbols.every(symbol => (metrics.get(symbol)?.barCount ?? 0) >= 50)
}

export interface HistoryCursor { symbol: string; history_through: string | null; bar_count: number }
export function historySyncStart(cursor: HistoryCursor | undefined, completed: string): string | null {
  if (cursor?.history_through && cursor.history_through >= completed) return null
  const anchor = cursor?.history_through ?? completed
  const days = cursor?.history_through ? 8 : MARKET_LOOKBACK_DAYS
  return new Date(Date.parse(`${anchor}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10)
}

/** Synchronization is independent of the compact metrics/cached screener path. */
export async function synchronizeDailyHistory(client: AlpacaClient, supabase: SupabaseServiceClient,
  symbols: string[], feed: Exclude<MarketFeed, 'illustrative'>, completed: string): Promise<number> {
  let fetchedCount = 0
  for (const symbolBatch of batches(symbols, 100)) {
    const cursors = await supabase.rpc('market_history_cursors', { p_symbols: symbolBatch, p_feed: feed })
    if (cursors.error) throw new Error(`Unable to read daily history cursors: ${cursors.error.message}`)
    const bySymbol = new Map<string, HistoryCursor>((cursors.data ?? []).map((r: HistoryCursor) => [r.symbol, r]))
    const groups = new Map<string, string[]>()
    for (const symbol of symbolBatch) {
      const start = historySyncStart(bySymbol.get(symbol), completed)
      if (start) groups.set(start, [...(groups.get(start) ?? []), symbol])
    }
    for (const [start, pending] of groups) {
      const result = await client.fetchDailyBars(pending, start, nextCalendarDate(completed), feed)
      if (result.feed !== feed) throw new Error(`History feed changed from ${feed} to ${result.feed}; retaining the previous snapshot`)
      const bars = result.data.filter(bar => bar.tradingDate <= completed)
      await persistDailyBars(supabase, bars)
      fetchedCount += bars.length
    }
  }
  return fetchedCount
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
      retrieved_at: new Date().toISOString(),
    })), { onConflict: 'symbol,trading_date,feed' })
    if (error) throw new Error(`Unable to persist daily market bars: ${error.message}`)
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

  const {error}=await supabase.rpc('replace_alpaca_asset_universe',{
    p_assets:assets.map(asset=>({symbol:asset.symbol,alpaca_id:asset.securityId??null,name:asset.name,exchange:asset.exchange,asset_class:asset.assetClass})),
    p_as_of:now.toISOString(),
  })
  if(error)throw new Error(`Unable to atomically persist asset universe: ${error.message}`)
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
  let dataAsOf = newestTimestamp(snapshotsResult.data, now.toISOString())
  let historyMetrics: Map<string, ScreenerHistoryMetrics>
  try {
    historyMetrics = await loadScreenerHistoryMetrics(supabase, symbols, feed, dataAsOf)
  } catch {
    historyMetrics = new Map()
  }
  // Alpaca can return delayed-SIP snapshots even where our durable daily bars
  // are IEX. Never blend those feeds: explicitly re-fetch the snapshots on
  // IEX when it is the only feed with usable persisted history.
  if (!hasUsableScreenerHistory(historyMetrics, symbols) && feed === 'delayed_sip') {
    let iexMetrics = new Map<string, ScreenerHistoryMetrics>()
    try {
      iexMetrics = await loadScreenerHistoryMetrics(supabase, symbols, 'iex', dataAsOf)
    } catch {
      // The compact reduction may be statement-limited on a large archive.
    }
    if (hasUsableScreenerHistory(iexMetrics, symbols) || (await loadCachedScreenerHistory(supabase, 'iex')).size > 0) {
      snapshotsResult = await client.fetchSnapshots(symbols, 'iex')
      feed = snapshotsResult.feed
      dataAsOf = newestTimestamp(snapshotsResult.data, now.toISOString())
      historyMetrics = iexMetrics
    }
  }
  const calendarStart = new Date(now.getTime() - 14 * 86_400_000).toISOString().slice(0, 10)
  const completed = lastCompletedSession(await client.fetchCalendar(calendarStart, isoDate(now)), now)
  if (!completed) throw new Error('No completed exchange session is available for history synchronization')
  const fetchedBarCount = await synchronizeDailyHistory(client, supabase, symbols, feed, completed.date)
  historyMetrics = new Map()
  for (const batch of batches(symbols, 100)) {
    const metrics = await loadScreenerHistoryMetrics(supabase, batch, feed, `${nextCalendarDate(completed.date)}T16:00:00Z`)
    for (const [symbol, metric] of metrics) historyMetrics.set(symbol, metric)
  }
  // Cached history is useful for diagnosis, but cannot make obsolete indicators fresh.
  const { data: snapshotRecord, error: snapshotError } = await supabase
    .from('market_snapshots')
    .insert({ feed, status: 'building', data_as_of: dataAsOf, history_through: completed.date })
    .select('id')
    .single()
  if (snapshotError || !snapshotRecord) throw new Error(`Unable to create market snapshot: ${snapshotError?.message ?? 'unknown error'}`)

  try {
    const assetsBySymbol = new Map<string, MarketAsset>(assets.map((asset) => [asset.symbol, asset]))

    const rows: ScreenerRow[] = snapshotsResult.data.flatMap((snapshot) => {
      const asset = assetsBySymbol.get(snapshot.symbol)
      if (!asset || historyMetrics.get(snapshot.symbol)?.historyThrough !== completed.date) return []
      const row = calculateScreenerRowFromMetrics(asset, snapshot, historyMetrics.get(snapshot.symbol)!)
      if (!row) return []
      const classification = taxonomyBySymbol.get(row.symbol)
      return [{
        ...row,
        sector: classification?.sector ?? 'Unclassified',
        subIndustry: classification?.subIndustry ?? 'Unclassified',
        history: { through: completed.date, feed, barCount: historyMetrics.get(snapshot.symbol)!.barCount, windows: { liquidity: 20, movingAverage: 50, year: 252 }, completeness: historyMetrics.get(snapshot.symbol)!.barCount >= 252 ? 'complete' : 'partial' },
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
        history_provenance: row.history,
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
      fetchedBarCount,
    }
  } catch (error) {
    await supabase.from('market_snapshots').update({
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    }).eq('id', snapshotRecord.id)
    throw error
  }
}
