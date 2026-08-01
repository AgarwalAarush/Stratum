import type {
  CrossAssetObservation,
  CrossAssetSnapshot,
  MarketEvidence,
  MarketFeed,
  MarketInstrument,
  MarketMemo,
  MarketOverviewResponse,
  MarketLeadershipSnapshot,
  MarketGroupMetric,
  MarketDivergenceSignal,
  CandidateBrief,
  CandidateWeeklySummary,
  StockLeadershipMetric,
  StockViewerData,
  ScreenerQuery,
  ScreenerResponse,
  ScreenerRow,
} from '../markets/types.ts'
import {
  aggregateLeadershipGroups,
  applyCurrentDayReturns,
  rankDailySubIndustries,
} from '../markets/leadership.ts'
import { runScreener } from '../markets/screener.ts'
import { buildDeterministicMarketMemo, type MarketStateInputs } from '../markets/state.ts'
import { crossAssetMarketInstrument } from './cross-asset.ts'
import { normalizeStockLeadershipRow } from './market-leadership.ts'
import { AsyncTtlCache } from './async-ttl-cache.ts'
import { cachedFetchWithFallback } from './cache.ts'
import { getSupabaseClient } from './supabase.ts'

const DATABASE_PAGE_SIZE = 1_000
const STALE_AFTER_MS = 20 * 60 * 1_000
const SNAPSHOT_META_CACHE_MS = 10_000
const SNAPSHOT_META_SHARED_CACHE_SECONDS = 10
const MARKET_OVERVIEW_CACHE_MS = 30_000
const MARKET_LEADERSHIP_CACHE_MS = 60_000
const CANDIDATE_CACHE_MS = 5_000
const CANDIDATE_WEEKLY_SUMMARY_CACHE_MS = 60_000
const CROSS_ASSET_CACHE_MS = 30_000
const STOCK_VIEWER_SHARED_CACHE_MS = 20_000
const MAX_CACHED_SNAPSHOTS = 2
const SCREENER_ROWS_SHARED_CACHE_SECONDS = 60

const snapshotRowsCache = new Map<string, ScreenerRow[]>()
const snapshotRowsInflight = new Map<string, Promise<ScreenerRow[] | null>>()

interface SnapshotRecord {
  id: string
  feed: MarketFeed
  data_as_of: string
  published_at: string | null
}

const snapshotMetaCache = new AsyncTtlCache<SnapshotRecord>({ maxEntries: 1 })
const marketOverviewCache = new AsyncTtlCache<MarketOverviewResponse>({ maxEntries: 1 })
const marketLeadershipCache = new AsyncTtlCache<MarketLeadershipSnapshot>({ maxEntries: 1 })
const marketLeadershipSummaryCache = new AsyncTtlCache<MarketLeadershipSnapshot>({ maxEntries: 1 })
const candidateCache = new AsyncTtlCache<CandidateBrief[]>({ maxEntries: 4 })
const candidateWeeklySummaryCache = new AsyncTtlCache<CandidateWeeklySummary>({ maxEntries: 1 })
const crossAssetCache = new AsyncTtlCache<CrossAssetSnapshot>({ maxEntries: 1 })
const stockViewerSharedCache = new AsyncTtlCache<StockViewerData>({ maxEntries: 64 })

async function fetchSharedArtifact<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T | null>,
): Promise<T | null> {
  const result = await cachedFetchWithFallback({
    key,
    ttlSeconds,
    fetcher,
    negativeTtlSeconds: Math.min(ttlSeconds, 10),
  })
  return result.data
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

interface MarketHomeRecord {
  content: unknown
  data_as_of: string
  generated_at: string
}

interface ScreenerRowRecord {
  symbol: string
  company: string
  price: number | string
  daily_change: number | string
  return_5d: number | string | null
  return_30d: number | string | null
  return_90d: number | string | null
  return_180d: number | string | null
  return_ytd: number | string | null
  return_1y: number | string | null
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
    return5d: row.return_5d == null ? null : Number(row.return_5d),
    return30d: row.return_30d == null ? null : Number(row.return_30d),
    return90d: row.return_90d == null ? null : Number(row.return_90d),
    return180d: row.return_180d == null ? null : Number(row.return_180d),
    returnYtd: row.return_ytd == null ? null : Number(row.return_ytd),
    return1y: row.return_1y == null ? null : Number(row.return_1y),
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

export async function fetchLatestSnapshotMeta(options: { bypassCache?: boolean } = {}): Promise<SnapshotRecord | null> {
  const supabase = getSupabaseClient()
  if (!supabase) return null
  const load = async () => {
    const { data, error } = await supabase
      .from('market_snapshots')
      .select('id,feed,data_as_of,published_at')
      .eq('status', 'complete')
      .eq('is_latest', true)
      .maybeSingle()
    return error || !data ? null : data as SnapshotRecord
  }
  if (options.bypassCache) return load()
  return fetchSharedArtifact(
    'stratum:markets:latest-snapshot-meta',
    SNAPSHOT_META_SHARED_CACHE_SECONDS,
    () => snapshotMetaCache.get('latest', SNAPSHOT_META_CACHE_MS, load),
  )
}

export async function getCachedSnapshotRows(
  snapshotId: string,
  loader: () => Promise<ScreenerRow[] | null>,
): Promise<ScreenerRow[] | null> {
  const cached = snapshotRowsCache.get(snapshotId)
  if (cached) return cached
  const pending = snapshotRowsInflight.get(snapshotId)
  if (pending) return pending

  const load = fetchSharedArtifact(
    `stratum:markets:screener-rows:${snapshotId}`,
    SCREENER_ROWS_SHARED_CACHE_SECONDS,
    loader,
  ).then((rows) => {
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
        .select('symbol,company,price,daily_change,return_5d,return_30d,return_90d,return_180d,return_ytd,return_1y,gap,volume,relative_volume,range_values,fifty_day_average,fifty_two_week_position,exchange,tradable,data_as_of')
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

function normalizeMarketOverview(value: unknown): MarketOverviewResponse | null {
  if (!isRecord(value) || !isRecord(value.state) || !isRecord(value.memo)) return null
  if (
    typeof value.state.regime !== 'string'
    || typeof value.state.confidence !== 'number'
    || typeof value.state.dataAsOf !== 'string'
    || !Array.isArray(value.instruments)
    || !Array.isArray(value.evidence)
    || typeof value.feed !== 'string'
    || typeof value.dataAsOf !== 'string'
    || typeof value.generatedAt !== 'string'
    || typeof value.stale !== 'boolean'
  ) return null
  return value as unknown as MarketOverviewResponse
}

/**
 * Builds the Overview read model from its normalized sources. This is used by
 * the worker; visitors should normally read the persisted result below.
 */
export async function composeLatestMarketOverview(snapshotOverride?: SnapshotRecord): Promise<MarketOverviewResponse | null> {
  const supabase = getSupabaseClient()
  const snapshot = snapshotOverride ?? await fetchLatestSnapshotMeta()
  if (!supabase || !snapshot) return null

  const contextPromise = Promise.all([
    fetchLatestCrossAssetSnapshot(),
    fetchLatestMarketLeadershipSummary(),
    fetchLatestCandidates(),
    fetchLatestCandidateWeeklySummary(),
  ])
  const { data: stateData, error: stateError } = await supabase
    .from('market_states')
    .select('id,regime,confidence,inputs,data_as_of,generated_at')
    .eq('snapshot_id', snapshot.id)
    .maybeSingle()
  if (stateError || !stateData) return null
  const state = stateData as StateRecord

  const { data: currentMemoData, error: currentMemoError } = await supabase
    .from('market_memos')
    .select('content,sources,generated_at')
    .eq('market_state_id', state.id)
    .maybeSingle()
  let memoRecord = !currentMemoError && currentMemoData ? currentMemoData as MemoRecord : null
  if (!memoRecord) {
    const { data: latestMemoData, error: latestMemoError } = await supabase
      .from('market_memos')
      .select('content,sources,generated_at')
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    memoRecord = !latestMemoError && latestMemoData ? latestMemoData as MemoRecord : null
  }
  const generatedAt = memoRecord?.generated_at ?? state.generated_at
  const storedMemo = memoRecord ? marketMemo(memoRecord.content, memoRecord.generated_at) : null
  const inputs = marketStateInputs(state.inputs)
  if (!inputs) return null
  const memo = storedMemo ?? buildDeterministicMarketMemo(
    inputs,
    state.data_as_of,
    generatedAt,
  )

  const [crossAsset, leadership, candidates, candidateWeeklySummary] = await contextPromise

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
    leadership: leadership ?? undefined,
    candidates,
    candidateWeeklySummary: candidateWeeklySummary ?? undefined,
  }
}

async function loadPersistedMarketOverview(): Promise<MarketOverviewResponse | null> {
  const supabase = getSupabaseClient()
  const snapshot = await fetchLatestSnapshotMeta()
  if (!supabase || !snapshot) return null
  const { data, error } = await supabase
    .from('market_home_snapshots')
    .select('content,data_as_of,generated_at')
    .eq('snapshot_id', snapshot.id)
    .maybeSingle()
  if (error || !data) return null
  const record = data as MarketHomeRecord
  const overview = normalizeMarketOverview(record.content)
  if (!overview || overview.dataAsOf !== snapshot.data_as_of) return null
  return {
    ...overview,
    stale: isStale(record.data_as_of),
  }
}

export async function fetchLatestMarketOverview(): Promise<MarketOverviewResponse | null> {
  return marketOverviewCache.get(
    'latest',
    MARKET_OVERVIEW_CACHE_MS,
    () => fetchSharedArtifact(
      'stratum:markets:overview:v2',
      MARKET_OVERVIEW_CACHE_MS / 1_000,
      async () => await loadPersistedMarketOverview() ?? await composeLatestMarketOverview(),
    ),
  )
}

interface LeadershipSnapshotRecord {
  id: string
  trading_date: string
  data_as_of: string
  generated_at: string
  universe_count: number
  usable_count: number
  fresh_count: number
  advancing_percent: number | string
  above_50_day_percent: number | string
}

function normalizeGroupMetric(row: Record<string, unknown>): MarketGroupMetric {
  const nullable = (value: unknown) => value === null || value === undefined ? null : Number(value)
  return {
    groupType: row.group_type as MarketGroupMetric['groupType'],
    label: String(row.label),
    sector: row.group_type === 'sector' ? null : String(row.sector),
    constituentCount: Number(row.constituent_count),
    dayReturn: nullable(row.day_return),
    return5d: nullable(row.return_5d),
    return30d: nullable(row.return_30d),
    return50d: nullable(row.return_50d),
    return200d: nullable(row.return_200d),
    return1y: nullable(row.return_1y),
    vs50DayAverage: nullable(row.vs_50_day_average),
    vs200DayAverage: nullable(row.vs_200_day_average),
  }
}

function currentDayReturnMap(rows: Array<Record<string, unknown>>): Map<string, number> {
  return new Map(rows.flatMap((row) => {
    const value = Number(row.daily_change)
    return typeof row.symbol === 'string' && Number.isFinite(value) ? [[row.symbol, value] as const] : []
  }))
}

function groupMetricKey(group: Pick<MarketGroupMetric, 'groupType' | 'sector' | 'label'>): string {
  return `${group.groupType}\u0000${group.sector ?? ''}\u0000${group.label}`
}

function attachCurrentGroupReturns(
  groups: MarketGroupMetric[],
  stocks: StockLeadershipMetric[],
): MarketGroupMetric[] {
  const currentGroups = new Map([
    ...aggregateLeadershipGroups(stocks, 'sector'),
    ...aggregateLeadershipGroups(stocks, 'sub_industry'),
  ].map((group) => [groupMetricKey(group), group.dayReturn]))
  return groups.map((group) => ({
    ...group,
    dayReturn: currentGroups.get(groupMetricKey(group)) ?? group.dayReturn,
  }))
}

function currentAdvancingPercent(
  stocks: Array<Pick<StockLeadershipMetric, 'dayReturn'>>,
  fallback: number,
): number {
  const available = stocks.filter((stock) => stock.dayReturn !== null && Number.isFinite(stock.dayReturn))
  if (available.length === 0) return fallback
  return Math.round((available.filter((stock) => stock.dayReturn! > 0).length / available.length) * 10_000) / 100
}

function normalizeDivergence(row: Record<string, unknown>): MarketDivergenceSignal {
  return {
    id: String(row.signal_id),
    scope: row.scope as MarketDivergenceSignal['scope'],
    symbol: row.symbol === null ? null : String(row.symbol),
    groupLabel: String(row.group_label),
    nearTermReturn: Number(row.near_term_return),
    longTermReturn: Number(row.long_term_return),
    spread: Number(row.spread),
    summary: String(row.summary),
  }
}

async function loadLatestMarketLeadership(): Promise<MarketLeadershipSnapshot | null> {
  const supabase = getSupabaseClient()
  if (!supabase) return null
  const { data: snapshotData, error: snapshotError } = await supabase
    .from('market_leadership_snapshots')
    .select('id,trading_date,data_as_of,generated_at,universe_count,usable_count,fresh_count,advancing_percent,above_50_day_percent')
    .eq('status', 'complete')
    .eq('is_latest', true)
    .maybeSingle()
  if (snapshotError || !snapshotData) return null
  const snapshot = snapshotData as LeadershipSnapshotRecord
  const [
    { data: stockRows, error: stockError },
    { data: groupRows, error: groupError },
    { data: divergenceRows, error: divergenceError },
    { data: screenerDailyRows, error: screenerDailyError },
  ] = await Promise.all([
    supabase.from('market_stock_metrics').select('*').eq('snapshot_id', snapshot.id),
    supabase.from('market_group_metrics').select('*').eq('snapshot_id', snapshot.id),
    supabase.from('market_divergence_signals').select('*').eq('snapshot_id', snapshot.id),
    supabase.from('screener_rows').select('symbol,daily_change').eq('snapshot_id', snapshot.id),
  ])
  if (stockError || groupError || divergenceError || screenerDailyError) return null
  const stocks = applyCurrentDayReturns(
    (stockRows ?? []).map((row) => normalizeStockLeadershipRow(row)),
    currentDayReturnMap((screenerDailyRows ?? []) as Array<Record<string, unknown>>),
  )
  const groups = attachCurrentGroupReturns((groupRows ?? []).map((row) => normalizeGroupMetric(row)), stocks)
  const by30Day = [...stocks].sort((left, right) => (right.return30d ?? -Infinity) - (left.return30d ?? -Infinity))
  return {
    id: snapshot.id,
    tradingDate: snapshot.trading_date,
    dataAsOf: snapshot.data_as_of,
    generatedAt: snapshot.generated_at,
    universeCount: snapshot.universe_count,
    usableCount: snapshot.usable_count,
    freshCount: snapshot.fresh_count,
    advancingPercent: currentAdvancingPercent(stocks, Number(snapshot.advancing_percent)),
    above50DayPercent: Number(snapshot.above_50_day_percent),
    sectors: groups.filter((group) => group.groupType === 'sector')
      .sort((left, right) => (right.return1y ?? -Infinity) - (left.return1y ?? -Infinity)),
    subIndustries: groups.filter((group) => group.groupType === 'sub_industry')
      .sort((left, right) => (right.return1y ?? -Infinity) - (left.return1y ?? -Infinity)),
    stocks,
    leaders: by30Day.slice(0, 10),
    laggards: by30Day.slice(-10).reverse(),
    divergences: (divergenceRows ?? []).map((row) => normalizeDivergence(row)),
  }
}

export async function fetchLatestMarketLeadership(): Promise<MarketLeadershipSnapshot | null> {
  return marketLeadershipCache.get(
    'latest',
    MARKET_LEADERSHIP_CACHE_MS,
    () => fetchSharedArtifact(
      'stratum:markets:leadership:v1',
      MARKET_LEADERSHIP_CACHE_MS / 1_000,
      loadLatestMarketLeadership,
    ),
  )
}

async function loadLatestMarketLeadershipSummary(): Promise<MarketLeadershipSnapshot | null> {
  const supabase = getSupabaseClient()
  if (!supabase) return null
  const { data: snapshotData, error: snapshotError } = await supabase
    .from('market_leadership_snapshots')
    .select('id,trading_date,data_as_of,generated_at,universe_count,usable_count,fresh_count,advancing_percent,above_50_day_percent')
    .eq('status', 'complete')
    .eq('is_latest', true)
    .maybeSingle()
  if (snapshotError || !snapshotData) return null
  const snapshot = snapshotData as LeadershipSnapshotRecord
  const [
    { data: stockDailyRows, error: stockDailyError },
    { data: divergenceRows, error: divergenceError },
    { data: screenerDailyRows, error: screenerDailyError },
  ] = await Promise.all([
    supabase.from('market_stock_metrics').select('symbol,company,sector,sub_industry,price,day_return,return_30d,return_50d,return_200d,return_1y,vs_50_day_average,vs_200_day_average,relative_volume,observation_count,data_as_of').eq('snapshot_id', snapshot.id),
    supabase.from('market_divergence_signals').select('*').eq('snapshot_id', snapshot.id),
    supabase.from('screener_rows').select('symbol,daily_change').eq('snapshot_id', snapshot.id),
  ])
  if (stockDailyError || divergenceError || screenerDailyError) return null
  const currentDayReturns = currentDayReturnMap((screenerDailyRows ?? []) as Array<Record<string, unknown>>)
  const dailyStocks = applyCurrentDayReturns(
    (stockDailyRows ?? []).map((row) => normalizeStockLeadershipRow(row)),
    currentDayReturns,
  )
  const dailySubIndustries = rankDailySubIndustries(dailyStocks)
  const dailySectors = aggregateLeadershipGroups(dailyStocks, 'sector')
    .sort((left, right) => (right.dayReturn ?? -Infinity) - (left.dayReturn ?? -Infinity))
  const byDay = [...dailyStocks]
    .filter((stock) => stock.dayReturn !== null)
    .sort((left, right) => right.dayReturn! - left.dayReturn!)
  return {
    id: snapshot.id,
    tradingDate: snapshot.trading_date,
    dataAsOf: snapshot.data_as_of,
    generatedAt: snapshot.generated_at,
    universeCount: snapshot.universe_count,
    usableCount: snapshot.usable_count,
    freshCount: snapshot.fresh_count,
    advancingPercent: currentAdvancingPercent(dailyStocks, Number(snapshot.advancing_percent)),
    above50DayPercent: Number(snapshot.above_50_day_percent),
    sectors: dailySectors,
    subIndustries: dailySubIndustries.map((group) => ({
      groupType: 'sub_industry',
      label: group.label,
      sector: group.sector,
      constituentCount: group.constituentCount,
      dayReturn: group.dayReturn,
      return5d: null,
      return30d: null,
      return50d: null,
      return200d: null,
      return1y: null,
      vs50DayAverage: null,
      vs200DayAverage: null,
    })),
    // Keep the home artifact compact while retaining enough individual names
    // to explain which stocks are driving today's market.
    stocks: [],
    leaders: byDay.slice(0, 3),
    laggards: byDay.slice(-3).reverse(),
    divergences: (divergenceRows ?? []).map((row) => normalizeDivergence(row)).slice(0, 5),
  }
}

export async function fetchLatestMarketLeadershipSummary(): Promise<MarketLeadershipSnapshot | null> {
  return marketLeadershipSummaryCache.get(
    'latest',
    MARKET_LEADERSHIP_CACHE_MS,
    () => fetchSharedArtifact(
      'stratum:markets:leadership-summary:v2',
      MARKET_LEADERSHIP_CACHE_MS / 1_000,
      loadLatestMarketLeadershipSummary,
    ),
  )
}

async function loadLatestCandidates(limit: number): Promise<CandidateBrief[]> {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const { data: latest } = await supabase
    .from('candidate_briefs')
    .select('trading_date')
    .order('trading_date', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!latest) return []
  const { data, error } = await supabase
    .from('candidate_briefs')
    .select('content')
    .eq('trading_date', latest.trading_date)
    .eq('status', 'new')
    .order('generated_at', { ascending: false })
    .limit(limit)
  if (error || !data) return []
  return data.flatMap((row) => {
    if (!isRecord(row.content) || typeof row.content.symbol !== 'string') return []
    return [row.content as unknown as CandidateBrief]
  })
}

export async function fetchLatestCandidates(limit = 8): Promise<CandidateBrief[]> {
  return candidateCache.get(String(limit), CANDIDATE_CACHE_MS, () => loadLatestCandidates(limit))
    .then((candidates) => candidates ?? [])
}

async function loadLatestCandidateWeeklySummary(): Promise<CandidateWeeklySummary | null> {
  const supabase = getSupabaseClient()
  if (!supabase) return null
  const { data, error } = await supabase
    .from('candidate_weekly_summaries')
    .select('content')
    .order('week_ending', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error || !data || !isRecord(data.content)) return null
  const summary = data.content
  if (typeof summary.weekEnding !== 'string' || !Array.isArray(summary.highlights)) return null
  return summary as unknown as CandidateWeeklySummary
}

export async function fetchLatestCandidateWeeklySummary(): Promise<CandidateWeeklySummary | null> {
  return candidateWeeklySummaryCache.get(
    'latest',
    CANDIDATE_WEEKLY_SUMMARY_CACHE_MS,
    () => fetchSharedArtifact(
      'stratum:markets:candidate-weekly-summary:v1',
      CANDIDATE_WEEKLY_SUMMARY_CACHE_MS / 1_000,
      loadLatestCandidateWeeklySummary,
    ),
  )
}

async function loadSharedStockViewerData(symbol: string): Promise<StockViewerData | null> {
  const supabase = getSupabaseClient()
  if (!supabase) return null
  const latestMarketPromise = fetchLatestSnapshotMeta()
  const latestLeadershipPromise = supabase
    .from('market_leadership_snapshots')
    .select('id')
    .eq('status', 'complete')
    .eq('is_latest', true)
    .maybeSingle()
  const [latestMarket, { data: latestLeadership }] = await Promise.all([
    latestMarketPromise,
    latestLeadershipPromise,
  ])
  if (!latestMarket) return null
  const [{ data: screener }, { data: asset }, { data: bars }, leadershipResult] = await Promise.all([
    supabase.from('screener_rows').select('symbol,company,price,daily_change,relative_volume,fifty_day_average,fifty_two_week_position,exchange,data_as_of')
      .eq('snapshot_id', latestMarket.id).eq('symbol', symbol).maybeSingle(),
    supabase.from('market_assets').select('name,exchange').eq('symbol', symbol).maybeSingle(),
    supabase.from('market_bars_daily').select('trading_date,close,volume').eq('symbol', symbol).eq('feed', latestMarket.feed)
      .order('trading_date', { ascending: false }).limit(260),
    latestLeadership
      ? supabase.from('market_stock_metrics').select('*').eq('snapshot_id', latestLeadership.id).eq('symbol', symbol).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])
  if (!screener && !asset) return null
  const leadership = leadershipResult.data ? normalizeStockLeadershipRow(leadershipResult.data) : null
  return {
    symbol,
    company: screener?.company ?? asset?.name ?? symbol,
    exchange: screener?.exchange ?? asset?.exchange ?? 'US',
    sector: leadership?.sector ?? 'Classification pending',
    subIndustry: leadership?.subIndustry ?? 'Classification pending',
    price: Number(screener?.price ?? leadership?.price ?? 0),
    dailyChange: screener ? Number(screener.daily_change) : leadership?.dayReturn ?? null,
    relativeVolume: screener ? Number(screener.relative_volume) : leadership?.relativeVolume ?? null,
    fiftyDayAverage: screener ? Number(screener.fifty_day_average) : null,
    fiftyTwoWeekPosition: screener ? Number(screener.fifty_two_week_position) : null,
    dataAsOf: screener?.data_as_of ?? leadership?.asOf ?? latestMarket.data_as_of,
    feed: latestMarket.feed,
    leadership,
    candidate: null,
    companyPacket: null,
    researchNote: null,
    decision: null,
    position: null,
    thesis: null,
    history: (bars ?? []).map((bar) => ({
      tradingDate: bar.trading_date,
      close: Number(bar.close),
      volume: Number(bar.volume),
    })).reverse(),
  }
}

export async function fetchStockViewerData(symbolInput: string, ownerId?: string): Promise<StockViewerData | null> {
  const symbol = symbolInput.trim().toUpperCase()
  if (!/^[A-Z][A-Z0-9.-]{0,11}$/.test(symbol)) return null
  const supabase = getSupabaseClient()
  if (!supabase) return null
  const sharedPromise = stockViewerSharedCache.get(
    symbol,
    STOCK_VIEWER_SHARED_CACHE_MS,
    () => loadSharedStockViewerData(symbol),
  )
  const ownerDataPromise = ownerId
    ? Promise.all([
        import('./company-research.ts').then((module) => module.fetchLatestCompanyPacket(ownerId, symbol)),
        import('./company-research.ts').then((module) => module.fetchLatestEquityResearch(ownerId, symbol)),
        import('./portfolio.ts').then((module) => module.fetchLatestDecision(ownerId, symbol)),
        import('./portfolio.ts').then((module) => module.fetchManualPosition(ownerId, symbol)),
        import('./theses.ts').then((module) => module.fetchLatestStockThesis(ownerId, symbol)),
      ])
    : Promise.resolve([null, null, null, null, null] as const)
  const candidatePromise = supabase
    .from('candidate_briefs')
    .select('content,status')
    .eq('symbol', symbol)
    .order('trading_date', { ascending: false })
    .limit(1)
    .maybeSingle()
  const [shared, [companyPacket, researchNote, decision, position, thesis], candidateResult] = await Promise.all([
    sharedPromise,
    ownerDataPromise,
    candidatePromise,
  ])
  if (!shared) return null
  const candidate = candidateResult.data && isRecord(candidateResult.data.content)
    ? { ...candidateResult.data.content, status: candidateResult.data.status } as unknown as CandidateBrief
    : null
  return {
    ...shared,
    candidate,
    companyPacket,
    researchNote,
    decision,
    position,
    thesis,
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

async function loadLatestCrossAssetSnapshot(): Promise<CrossAssetSnapshot | null> {
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

export async function fetchLatestCrossAssetSnapshot(): Promise<CrossAssetSnapshot | null> {
  return crossAssetCache.get(
    'latest',
    CROSS_ASSET_CACHE_MS,
    () => fetchSharedArtifact(
      'stratum:markets:cross-asset:v1',
      CROSS_ASSET_CACHE_MS / 1_000,
      loadLatestCrossAssetSnapshot,
    ),
  )
}
