import type {
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
import { getSupabaseClient } from './supabase.ts'

const DATABASE_PAGE_SIZE = 1_000
const STALE_AFTER_MS = 20 * 60 * 1_000

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
      && typeof item.label === 'string'
      && typeof item.value === 'string'
      && typeof item.change === 'string'
      && (item.direction === 'up' || item.direction === 'down')
  })
  return instruments.length > 0 ? instruments : null
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

  const { data, error } = await supabase
    .from('market_snapshots')
    .select('id,feed,data_as_of,published_at')
    .eq('status', 'complete')
    .eq('is_latest', true)
    .maybeSingle()
  if (error || !data) return null
  return data as SnapshotRecord
}

export async function fetchLatestScreener(query: ScreenerQuery): Promise<ScreenerResponse | null> {
  const supabase = getSupabaseClient()
  const snapshot = await fetchLatestSnapshotMeta()
  if (!supabase || !snapshot) return null

  const rows: ScreenerRow[] = []
  for (let from = 0; ; from += DATABASE_PAGE_SIZE) {
    const { data, error } = await supabase
      .from('screener_rows')
      .select('symbol,company,price,daily_change,gap,volume,relative_volume,range_values,fifty_day_average,fifty_two_week_position,exchange,tradable,data_as_of')
      .eq('snapshot_id', snapshot.id)
      .range(from, from + DATABASE_PAGE_SIZE - 1)
    if (error) return null
    const page = (data ?? []) as ScreenerRowRecord[]
    rows.push(...page.map(normalizeScreenerRow))
    if (page.length < DATABASE_PAGE_SIZE) break
  }

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
  if (memoError || !memoData) return null
  const memoRecord = memoData as MemoRecord
  const memo = marketMemo(memoRecord.content, memoRecord.generated_at)
  const instruments = isRecord(state.inputs) ? marketInstruments(state.inputs.instruments) : null
  if (!memo || !instruments) return null

  return {
    state: {
      regime: state.regime,
      confidence: Number(state.confidence),
      dataAsOf: state.data_as_of,
    },
    memo,
    instruments,
    evidence: marketEvidence(memoRecord.sources),
    feed: snapshot.feed,
    dataAsOf: snapshot.data_as_of,
    generatedAt: memoRecord.generated_at,
    stale: isStale(snapshot.data_as_of),
  }
}
