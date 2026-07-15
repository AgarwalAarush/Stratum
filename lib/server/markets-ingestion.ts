import { calculateScreenerRow } from '../markets/calculations.ts'
import type { MarketAsset, MarketDailyBar, MarketFeed, ScreenerRow } from '../markets/types.ts'
import { getAlpacaClient, type AlpacaClient } from './alpaca.ts'
import { getSupabaseClient } from './supabase.ts'

const DATABASE_BATCH_SIZE = 500
const MARKET_LOOKBACK_DAYS = 380

function batches<T>(items: T[], size = DATABASE_BATCH_SIZE): T[][] {
  const result: T[][] = []
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size))
  return result
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function newestTimestamp(rows: Array<{ asOf: string }>, fallback: string): string {
  return rows.reduce((latest, row) => row.asOf > latest ? row.asOf : latest, fallback)
}

export interface MaterializeMarketsOptions {
  client?: AlpacaClient
  now?: Date
  symbols?: string[]
}

export interface MaterializeMarketsResult {
  snapshotId: string
  feed: Exclude<MarketFeed, 'illustrative'>
  rowCount: number
  dataAsOf: string
}

export async function materializeAlpacaScreener(options: MaterializeMarketsOptions = {}): Promise<MaterializeMarketsResult> {
  const client = options.client ?? getAlpacaClient()
  const supabase = getSupabaseClient()
  if (!client) throw new Error('Alpaca credentials are not configured')
  if (!supabase) throw new Error('Supabase service credentials are not configured')

  const now = options.now ?? new Date()
  const allAssets = await client.fetchAssets()
  const requestedSymbols = options.symbols ? new Set(options.symbols.map((symbol) => symbol.toUpperCase())) : null
  const assets = allAssets.filter((asset) => asset.active && asset.tradable && (!requestedSymbols || requestedSymbols.has(asset.symbol)))
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

  const symbols = assets.map((asset) => asset.symbol)
  const snapshotsResult = await client.fetchSnapshots(symbols)
  const feed = snapshotsResult.feed
  const start = new Date(now)
  start.setUTCDate(start.getUTCDate() - MARKET_LOOKBACK_DAYS)
  const barsResult = await client.fetchDailyBars(symbols, isoDate(start), isoDate(now), feed)
  if (barsResult.feed !== feed) throw new Error(`Alpaca returned inconsistent feeds: ${feed} and ${barsResult.feed}`)

  for (const batch of batches(barsResult.data)) {
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
    for (const bar of barsResult.data) barsBySymbol.set(bar.symbol, [...(barsBySymbol.get(bar.symbol) ?? []), bar])

    const rows: ScreenerRow[] = snapshotsResult.data.flatMap((snapshot) => {
      const asset = assetsBySymbol.get(snapshot.symbol)
      if (!asset) return []
      const row = calculateScreenerRow(asset, snapshot, barsBySymbol.get(snapshot.symbol) ?? [])
      return row ? [row] : []
    })
    if (rows.length === 0) throw new Error('No screener rows had sufficient market history')

    for (const batch of batches(rows)) {
      const { error } = await supabase.from('screener_rows').insert(batch.map((row) => ({
        snapshot_id: snapshotRecord.id,
        symbol: row.symbol,
        company: row.company,
        price: row.price,
        daily_change: row.dailyChange,
        gap: row.gap,
        volume: row.volume,
        relative_volume: row.relativeVolume,
        range_values: row.range,
        fifty_day_average: row.fiftyDayAverage,
        fifty_two_week_position: row.fiftyTwoWeekPosition,
        exchange: row.exchange,
        tradable: row.tradable,
        data_as_of: row.asOf,
      })))
      if (error) throw new Error(`Unable to persist screener rows: ${error.message}`)
    }

    const { error: publishError } = await supabase.rpc('publish_screener_snapshot', { p_snapshot_id: snapshotRecord.id })
    if (publishError) throw new Error(`Unable to publish market snapshot: ${publishError.message}`)

    return { snapshotId: snapshotRecord.id, feed, rowCount: rows.length, dataAsOf }
  } catch (error) {
    await supabase.from('market_snapshots').update({
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    }).eq('id', snapshotRecord.id)
    throw error
  }
}
