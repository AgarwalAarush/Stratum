import type {
  CrossAssetObservation,
  CrossAssetSnapshot,
  MarketEvidence,
  MarketFeed,
  MarketInstrument,
  MarketMemo,
  MarketOverviewResponse,
  ScreenerQuery,
  ScreenerResponse,
  ScreenerRow,
} from '../markets/types.ts'
import { runScreener } from '../markets/screener.ts'
import { buildDeterministicMarketMemo, type MarketStateInputs } from '../markets/state.ts'
import { crossAssetMarketInstrument } from './cross-asset.ts'
import { getSupabaseClient } from './supabase.ts'

const DATABASE_PAGE_SIZE = 1_000
const STALE_AFTER_MS = 20 * 60 * 1_000
const SNAPSHOT_META_CACHE_MS = 10_000
const MAX_CACHED_SNAPSHOTS = 2

let snapshotMetaCache: { expiresAt: number; value: SnapshotRecord } | null = null
const snapshotRowsCache = new Map<string, ScreenerRow[]>()
const snapshotRowsInflight = new Map<string, Promise<ScreenerRow[] | null>>()

interface SnapshotRecord {
  id: string
  feed: MarketFeed
  data_as_of: string
  published_at: string | null
}

interface StateRecord {
  id: string
  regime: string
  confidence: number | string
  inputs: unknown
  data_as_of: string
  generated_at: string
}

interface MemoRecord {
  content: unknown
  sources: unknown
  generated_at: string
}

interface ScreenerRowRecord {
  symbol: string
  company: string
  price: number | string
  daily_change: number | string
  gap: number | string
  volume: number | string
  relative_volume: number | string
  range_values: unknown
  fifty_day_average: number | string
  fifty_two_week_position: number | string
  exchange: string
  tradable: boolean
  data_as_of: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStale(dataAsOf: string): boolean {
  const timestamp = Date.parse(dataAsOf)
  return !Number.isFinite(timestamp) || Date.now() - timestamp > STALE_AFTER_MS
}

function marketInstruments(value: unknown): MarketInstrument[] | null {
  if (!Array.isArray(value)) return null
  const instruments = value.filter((item): item is MarketInstrument => {
    if (!isRecord(item)) return false
    return typeof item.id === 'string'
      && typeof item.symbol === 'string'
      && typeof item.label === 'string'
      && typeof item.value === 'string'
      && typeof item.change === 'string'
      && (item.direction === 'up' || item.direction === 'down' || item.direction === 'flat')
      && typeof item.instrumentType === 'string'
      && typeof item.source === 'string'
      && typeof item.sourceLabel === 'string'
      && typeof item.sourceUrl === 'string'
      && typeof item.feedTimestamp === 'string'
      && typeof item.retrievedAt === 'string'
      && typeof item.dataStatus === 'string'
      && typeof item.unit === 'string'
  })
  return instruments
}

function marketStateInputs(value: unknown): MarketStateInputs | null {
  if (!isRecord(value)) return null
  const instruments = marketInstruments(value.instruments)
  const leaders = Array.isArray(value.leaders) ? value.leaders : null
  const laggards = Array.isArray(value.laggards) ? value.laggards : null
  if (
    !instruments
    || !leaders
    || !laggards
    || typeof value.advancingPercent !== 'number'
    || typeof value.aboveFiftyDayPercent !== 'number'
    || typeof value.averageChange !== 'number'
  ) return null

  const normalizeMovers = (items: unknown[]) => items.flatMap((item) => {
    if (
      !isRecord(item)
      || typeof item.symbol !== 'string'
      || typeof item.change !== 'number'
      || typeof item.relativeVolume !== 'number'
    ) return []
    return [{ symbol: item.symbol, change: item.change, relativeVolume: item.relativeVolume }]
  })

  return {
    advancingPercent: value.advancingPercent,
    aboveFiftyDayPercent: value.aboveFiftyDayPercent,
    averageChange: value.averageChange,
    leaders: normalizeMovers(leaders),
    laggards: normalizeMovers(laggards),
    instruments,
  }
}

function marketEvidence(value: unknown): MarketEvidence[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is MarketEvidence => {
    if (!isRecord(item)) return false
    return typeof item.id === 'string'
      && typeof item.source === 'string'
      && typeof item.publishedAt === 'string'
      && typeof item.url === 'string'
  })
}

function marketMemo(value: unknown, generatedAt: string): MarketMemo | null {
  if (!isRecord(value)) return null
  const changes = Array.isArray(value.changes) ? value.changes : null
  const sectorImplications = Array.isArray(value.sectorImplications) ? value.sectorImplications : null
  const catalysts = Array.isArray(value.catalysts) ? value.catalysts : null
  const risks = Array.isArray(value.risks) ? value.risks : null
  const watchItems = Array.isArray(value.watchItems) ? value.watchItems : null
  if (!changes || !sectorImplications || !catalysts || !risks || !watchItems) return null

  return {
    changes: changes as MarketMemo['changes'],
    sectorImplications: sectorImplications as MarketMemo['sectorImplications'],
    catalysts: catalysts.filter((item): item is string => typeof item === 'string'),
    risks: risks.filter((item): item is string => typeof item === 'string'),
    watchItems: watchItems.filter((item): item is string => typeof item === 'string'),
    generatedAt,
  }
}

function normalizeScreenerRow(row: ScreenerRowRecord): ScreenerRow {
  return {
    symbol: row.symbol,
    company: row.company,
    price: Number(row.price),
    dailyChange: Number(row.daily_change),
    gap: Number(row.gap),
    volume: Number(row.volume),
    relativeVolume: Number(row.relative_volume),
    range: Array.isArray(row.range_values) ? row.range_values.map(Number).filter(Number.isFinite) : [],
    fiftyDayAverage: Number(row.fifty_day_average),
    fiftyTwoWeekPosition: Number(row.fifty_two_week_position),
    exchange: row.exchange,
    tradable: row.tradable,
    asOf: row.data_as_of,
  }
}

export async function fetchLatestSnapshotMeta(): Promise<SnapshotRecord | null> {
  const supabase = getSupabaseClient()
  if (!supabase) return null
  if (snapshotMetaCache && snapshotMetaCache.expiresAt > Date.now()) return snapshotMetaCache.value

  const { data, error } = await supabase
    .from('market_snapshots')
    .select('id,feed,data_as_of,published_at')
    .eq('status', 'complete')
    .eq('is_latest', true)
    .maybeSingle()
  if (error || !data) return null
  const snapshot = data as SnapshotRecord
  snapshotMetaCache = { expiresAt: Date.now() + SNAPSHOT_META_CACHE_MS, value: snapshot }
  return snapshot
}

export async function getCachedSnapshotRows(
  snapshotId: string,
  loader: () => Promise<ScreenerRow[] | null>,
): Promise<ScreenerRow[] | null> {
  const cached = snapshotRowsCache.get(snapshotId)
  if (cached) return cached
  const pending = snapshotRowsInflight.get(snapshotId)
  if (pending) return pending

  const load = loader().then((rows) => {
    if (rows) {
      snapshotRowsCache.set(snapshotId, rows)
      while (snapshotRowsCache.size > MAX_CACHED_SNAPSHOTS) {
        const oldest = snapshotRowsCache.keys().next().value
        if (typeof oldest !== 'string') break
        snapshotRowsCache.delete(oldest)
      }
    }
    return rows
  }).finally(() => snapshotRowsInflight.delete(snapshotId))
  snapshotRowsInflight.set(snapshotId, load)
  return load
}

export async function fetchLatestScreener(query: ScreenerQuery): Promise<ScreenerResponse | null> {
  const supabase = getSupabaseClient()
  const snapshot = await fetchLatestSnapshotMeta()
  if (!supabase || !snapshot) return null

  const rows = await getCachedSnapshotRows(snapshot.id, async () => {
    const loaded: ScreenerRow[] = []
    for (let from = 0; ; from += DATABASE_PAGE_SIZE) {
      const { data, error } = await supabase
        .from('screener_rows')
        .select('symbol,company,price,daily_change,gap,volume,relative_volume,range_values,fifty_day_average,fifty_two_week_position,exchange,tradable,data_as_of')
        .eq('snapshot_id', snapshot.id)
        .range(from, from + DATABASE_PAGE_SIZE - 1)
      if (error) return null
      const page = (data ?? []) as ScreenerRowRecord[]
      loaded.push(...page.map(normalizeScreenerRow))
      if (page.length < DATABASE_PAGE_SIZE) break
    }
    return loaded
  })
  if (!rows) return null

  return runScreener(query, rows, {
    feed: snapshot.feed,
    dataAsOf: snapshot.data_as_of,
    snapshotId: snapshot.id,
    stale: isStale(snapshot.data_as_of),
  })
}

export async function fetchLatestMarketOverview(): Promise<MarketOverviewResponse | null> {
  const supabase = getSupabaseClient()
  const snapshot = await fetchLatestSnapshotMeta()
  if (!supabase || !snapshot) return null

  const { data: stateData, error: stateError } = await supabase
    .from('market_states')
    .select('id,regime,confidence,inputs,data_as_of,generated_at')
    .eq('snapshot_id', snapshot.id)
    .maybeSingle()
  if (stateError || !stateData) return null
  const state = stateData as StateRecord

  const { data: memoData, error: memoError } = await supabase
    .from('market_memos')
    .select('content,sources,generated_at')
    .eq('market_state_id', state.id)
    .maybeSingle()
  const memoRecord = !memoError && memoData ? memoData as MemoRecord : null
  const generatedAt = memoRecord?.generated_at ?? state.generated_at
  const storedMemo = memoRecord ? marketMemo(memoRecord.content, memoRecord.generated_at) : null
  const inputs = marketStateInputs(state.inputs)
  if (!inputs) return null
  const memo = storedMemo ?? buildDeterministicMarketMemo(
    inputs,
    state.data_as_of,
    generatedAt,
  )

  const crossAsset = await fetchLatestCrossAssetSnapshot()

  return {
    state: {
      regime: state.regime,
      confidence: Number(state.confidence),
      dataAsOf: state.data_as_of,
    },
    memo,
    instruments: crossAsset?.observations.map(crossAssetMarketInstrument) ?? inputs.instruments,
    evidence: memoRecord
      ? marketEvidence(memoRecord.sources)
      : [{
          id: 'alpaca-market-data',
          source: 'Alpaca Market Data',
          publishedAt: state.data_as_of,
          url: 'https://alpaca.markets/data',
        }],
    feed: snapshot.feed,
    dataAsOf: snapshot.data_as_of,
    generatedAt,
    stale: isStale(snapshot.data_as_of),
  }
}

interface CrossAssetSnapshotRecord {
  id: string
  status: CrossAssetSnapshot['status']
  data_as_of: string
  retrieved_at: string
  published_at: string | null
}

interface CrossAssetObservationRecord {
  instrument_id: string
  symbol: string
  label: string
  instrument_type: CrossAssetObservation['instrumentType']
  value: number | string
  previous_value: number | string | null
  change_percent: number | string | null
  unit: CrossAssetObservation['unit']
  source: CrossAssetObservation['source']
  source_label: string
  source_url: string
  feed_timestamp: string
  retrieved_at: string
  data_status: CrossAssetObservation['dataStatus']
}

export async function fetchLatestCrossAssetSnapshot(): Promise<CrossAssetSnapshot | null> {
  const supabase = getSupabaseClient()
  if (!supabase) return null
  const { data: snapshotData, error: snapshotError } = await supabase
    .from('cross_asset_snapshots')
    .select('id,status,data_as_of,retrieved_at,published_at')
    .eq('status', 'complete')
    .eq('is_latest', true)
    .maybeSingle()
  if (snapshotError || !snapshotData) return null
  const snapshot = snapshotData as CrossAssetSnapshotRecord
  const { data, error } = await supabase
    .from('cross_asset_observations')
    .select('instrument_id,symbol,label,instrument_type,value,previous_value,change_percent,unit,source,source_label,source_url,feed_timestamp,retrieved_at,data_status')
    .eq('snapshot_id', snapshot.id)
  if (error || !data) return null

  const observations = (data as CrossAssetObservationRecord[]).map((row) => ({
    id: row.instrument_id,
    symbol: row.symbol,
    label: row.label,
    instrumentType: row.instrument_type,
    value: Number(row.value),
    previousValue: row.previous_value === null ? null : Number(row.previous_value),
    changePercent: row.change_percent === null ? null : Number(row.change_percent),
    unit: row.unit,
    source: row.source,
    sourceLabel: row.source_label,
    sourceUrl: row.source_url,
    feedTimestamp: row.feed_timestamp,
    retrievedAt: row.retrieved_at,
    dataStatus: row.data_status,
  })).sort((left, right) => {
    const order = ['sp500', 'nasdaq-composite', 'russell-2000', 'dow', 'vix', 'us-2y', 'us-10y', 'broad-usd', 'wti', 'gold', 'bitcoin']
    return order.indexOf(left.id) - order.indexOf(right.id)
  })

  return {
    id: snapshot.id,
    status: snapshot.status,
    observations,
    dataAsOf: snapshot.data_as_of,
    retrievedAt: snapshot.retrieved_at,
    publishedAt: snapshot.published_at,
  }
}
