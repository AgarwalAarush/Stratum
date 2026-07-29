import type {
  CrossAssetInstrumentType,
  CrossAssetObservation,
  CrossAssetSnapshot,
  MarketDataStatus,
  MarketInstrument,
} from '../markets/types.ts'
import { fetchFmpStableJson } from './fmp.ts'
import { getSupabaseClient } from './supabase.ts'

interface InstrumentDefinition {
  id: string
  symbol: string
  label: string
  instrumentType: CrossAssetInstrumentType
  unit: MarketInstrument['unit']
  dataStatus: MarketDataStatus
}

interface FmpQuote {
  symbol?: string
  price?: number
  change?: number
  changesPercentage?: number
  timestamp?: number | string
  date?: string
}

interface FmpTreasuryRate {
  date?: string
  year2?: number
  year10?: number
}

const FMP_QUOTES: InstrumentDefinition[] = [
  { id: 'sp500', symbol: '^GSPC', label: 'S&P 500', instrumentType: 'equity_index', unit: 'index_points', dataStatus: 'delayed' },
  { id: 'nasdaq-composite', symbol: '^IXIC', label: 'Nasdaq Composite', instrumentType: 'equity_index', unit: 'index_points', dataStatus: 'delayed' },
  { id: 'russell-2000', symbol: '^RUT', label: 'Russell 2000', instrumentType: 'equity_index', unit: 'index_points', dataStatus: 'delayed' },
  { id: 'dow', symbol: '^DJI', label: 'Dow', instrumentType: 'equity_index', unit: 'index_points', dataStatus: 'delayed' },
  { id: 'vix', symbol: '^VIX', label: 'VIX', instrumentType: 'volatility_index', unit: 'index_points', dataStatus: 'delayed' },
  { id: 'gold', symbol: 'GCUSD', label: 'Gold', instrumentType: 'commodity', unit: 'usd', dataStatus: 'delayed' },
  { id: 'bitcoin', symbol: 'BTCUSD', label: 'Bitcoin', instrumentType: 'crypto', unit: 'usd', dataStatus: 'delayed' },
]

const FRED_SERIES: Array<InstrumentDefinition & { seriesId: string }> = [
  {
    id: 'broad-usd',
    symbol: 'DTWEXBGS',
    seriesId: 'DTWEXBGS',
    label: 'Broad USD',
    instrumentType: 'currency_index',
    unit: 'index_points',
    dataStatus: 'end_of_day',
  },
  {
    id: 'wti',
    symbol: 'DCOILWTICO',
    seriesId: 'DCOILWTICO',
    label: 'WTI',
    instrumentType: 'commodity',
    unit: 'usd',
    dataStatus: 'end_of_day',
  },
]

export const CROSS_ASSET_INSTRUMENT_IDS = [
  'sp500',
  'nasdaq-composite',
  'russell-2000',
  'dow',
  'vix',
  'us-2y',
  'us-10y',
  'broad-usd',
  'wti',
  'gold',
  'bitcoin',
] as const

function numeric(value: unknown): number | null {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function timestamp(value: FmpQuote['timestamp'] | FmpQuote['date'], fallback: string): string {
  if (typeof value === 'number') return new Date(value * 1_000).toISOString()
  if (typeof value === 'string' && value) {
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString()
  }
  return fallback
}

function percentChange(value: number, previousValue: number | null): number | null {
  if (previousValue === null || previousValue === 0) return null
  return ((value - previousValue) / previousValue) * 100
}

export function normalizeFmpQuote(
  definition: InstrumentDefinition,
  quote: FmpQuote,
  retrievedAt: string,
  previousValue: number | null = null,
): CrossAssetObservation {
  const value = numeric(quote.price)
  if (value === null) throw new Error(`FMP returned no price for ${definition.symbol}`)
  const suppliedChange = numeric(quote.changesPercentage)
  const prior = previousValue ?? (
    numeric(quote.change) === null ? null : value - Number(quote.change)
  )
  return {
    id: definition.id,
    symbol: definition.symbol,
    label: definition.label,
    instrumentType: definition.instrumentType,
    value,
    previousValue: prior,
    changePercent: suppliedChange ?? percentChange(value, prior),
    unit: definition.unit,
    source: 'fmp',
    sourceLabel: 'Financial Modeling Prep',
    sourceUrl: 'https://site.financialmodelingprep.com/developer/docs',
    feedTimestamp: timestamp(quote.timestamp ?? quote.date, retrievedAt),
    retrievedAt,
    dataStatus: definition.dataStatus,
  }
}

export function normalizeTreasuryRates(rows: FmpTreasuryRate[], retrievedAt: string): CrossAssetObservation[] {
  const row = rows.find((candidate) => numeric(candidate.year2) !== null && numeric(candidate.year10) !== null)
  if (!row) throw new Error('FMP returned no complete 2Y/10Y Treasury rate record')
  const feedTimestamp = timestamp(row.date, retrievedAt)
  return [
    {
      id: 'us-2y',
      symbol: 'US2Y',
      label: 'US 2Y',
      instrumentType: 'treasury_yield',
      value: Number(row.year2),
      previousValue: null,
      changePercent: null,
      unit: 'percent',
      source: 'fmp',
      sourceLabel: 'Financial Modeling Prep',
      sourceUrl: 'https://site.financialmodelingprep.com/developer/docs',
      feedTimestamp,
      retrievedAt,
      dataStatus: 'end_of_day',
    },
    {
      id: 'us-10y',
      symbol: 'US10Y',
      label: 'US 10Y',
      instrumentType: 'treasury_yield',
      value: Number(row.year10),
      previousValue: null,
      changePercent: null,
      unit: 'percent',
      source: 'fmp',
      sourceLabel: 'Financial Modeling Prep',
      sourceUrl: 'https://site.financialmodelingprep.com/developer/docs',
      feedTimestamp,
      retrievedAt,
      dataStatus: 'end_of_day',
    },
  ]
}

export function parseFredCsv(csv: string): Array<{ date: string; value: number }> {
  const lines = csv.trim().split(/\r?\n/)
  return lines.slice(1).flatMap((line) => {
    const [date, rawValue] = line.split(',')
    const value = numeric(rawValue)
    return date && value !== null ? [{ date, value }] : []
  })
}

export function normalizeFredObservation(
  definition: InstrumentDefinition,
  points: Array<{ date: string; value: number }>,
  retrievedAt: string,
): CrossAssetObservation {
  const latest = points.at(-1)
  if (!latest) throw new Error(`FRED returned no observations for ${definition.symbol}`)
  const previous = points.length > 1 ? points.at(-2)!.value : null
  return {
    id: definition.id,
    symbol: definition.symbol,
    label: definition.label,
    instrumentType: definition.instrumentType,
    value: latest.value,
    previousValue: previous,
    changePercent: percentChange(latest.value, previous),
    unit: definition.unit,
    source: 'fred',
    sourceLabel: 'Federal Reserve Bank of St. Louis',
    sourceUrl: `https://fred.stlouisfed.org/series/${definition.symbol}`,
    feedTimestamp: new Date(`${latest.date}T00:00:00.000Z`).toISOString(),
    retrievedAt,
    dataStatus: definition.dataStatus,
  }
}

export interface CrossAssetFetchOptions {
  fmpApiKey?: string
  fetchImpl?: typeof fetch
  now?: Date
}

function formatValue(observation: CrossAssetObservation): string {
  if (observation.unit === 'percent') return `${observation.value.toFixed(2)}%`
  const maximumFractionDigits = observation.value >= 10_000 ? 0 : 2
  const formatted = observation.value.toLocaleString('en-US', {
    minimumFractionDigits: maximumFractionDigits === 0 ? 0 : 2,
    maximumFractionDigits,
  })
  return observation.unit === 'usd' ? `$${formatted}` : formatted
}

export function crossAssetMarketInstrument(observation: CrossAssetObservation): MarketInstrument {
  const change = observation.changePercent
  return {
    id: observation.id,
    symbol: observation.symbol,
    label: observation.label,
    value: formatValue(observation),
    change: change === null ? '—' : `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`,
    direction: change === null ? 'flat' : change > 0 ? 'up' : change < 0 ? 'down' : 'flat',
    instrumentType: observation.instrumentType,
    source: observation.source,
    sourceLabel: observation.sourceLabel,
    sourceUrl: observation.sourceUrl,
    feedTimestamp: observation.feedTimestamp,
    retrievedAt: observation.retrievedAt,
    dataStatus: observation.dataStatus,
    unit: observation.unit,
  }
}

export async function fetchCrossAssetObservations(
  options: CrossAssetFetchOptions = {},
): Promise<CrossAssetObservation[]> {
  const fmpApiKey = options.fmpApiKey ?? process.env.FMP_API_KEY
  if (!fmpApiKey) throw new Error('FMP_API_KEY is not configured')
  const fetchImpl = options.fetchImpl ?? fetch
  const retrievedAt = (options.now ?? new Date()).toISOString()

  const [quoteGroups, treasuryRows, fredRows] = await Promise.all([
    Promise.all(FMP_QUOTES.map(async (definition) => {
      const rows = await fetchFmpStableJson<FmpQuote[]>(
        'quote-short',
        { symbol: definition.symbol },
        { apiKey: fmpApiKey, fetchImpl },
      )
      const quote = rows[0]
      if (!quote) throw new Error(`FMP returned no quote for ${definition.symbol}`)
      return normalizeFmpQuote(definition, quote, retrievedAt)
    })),
    fetchFmpStableJson<FmpTreasuryRate[]>(
      'treasury-rates',
      {},
      { apiKey: fmpApiKey, fetchImpl },
    ).then((rows) => normalizeTreasuryRates(rows, retrievedAt)),
    Promise.all(FRED_SERIES.map(async (definition) => {
      const url = new URL('https://fred.stlouisfed.org/graph/fredgraph.csv')
      url.searchParams.set('id', definition.seriesId)
      const response = await fetchImpl(url, {
        signal: AbortSignal.timeout(12_000),
        headers: { 'User-Agent': 'Stratum/0.3 (+market-intelligence-worker)' },
      })
      if (!response.ok) throw new Error(`FRED request failed (${response.status}) for ${definition.seriesId}`)
      return normalizeFredObservation(definition, parseFredCsv(await response.text()), retrievedAt)
    })),
  ])

  const observations = [...quoteGroups, ...treasuryRows, ...fredRows]
    .sort((left, right) => CROSS_ASSET_INSTRUMENT_IDS.indexOf(left.id as typeof CROSS_ASSET_INSTRUMENT_IDS[number])
      - CROSS_ASSET_INSTRUMENT_IDS.indexOf(right.id as typeof CROSS_ASSET_INSTRUMENT_IDS[number]))
  const received = new Set(observations.map((observation) => observation.id))
  const missing = CROSS_ASSET_INSTRUMENT_IDS.filter((id) => !received.has(id))
  if (missing.length > 0) throw new Error(`Cross-asset snapshot is incomplete: ${missing.join(', ')}`)
  return observations
}

export async function materializeCrossAssetSnapshot(
  options: CrossAssetFetchOptions = {},
): Promise<CrossAssetSnapshot> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const retrievedAt = (options.now ?? new Date()).toISOString()
  const { data: snapshot, error: createError } = await supabase
    .from('cross_asset_snapshots')
    .insert({ status: 'building', retrieved_at: retrievedAt })
    .select('id')
    .single()
  if (createError || !snapshot) {
    throw new Error(`Unable to create cross-asset snapshot: ${createError?.message ?? 'unknown error'}`)
  }

  try {
    const observations = await fetchCrossAssetObservations({ ...options, now: new Date(retrievedAt) })
    const dataAsOf = observations.reduce(
      (latest, observation) => observation.feedTimestamp > latest ? observation.feedTimestamp : latest,
      observations[0]!.feedTimestamp,
    )
    const { error: insertError } = await supabase.from('cross_asset_observations').insert(
      observations.map((observation) => ({
        snapshot_id: snapshot.id,
        instrument_id: observation.id,
        symbol: observation.symbol,
        label: observation.label,
        instrument_type: observation.instrumentType,
        value: observation.value,
        previous_value: observation.previousValue,
        change_percent: observation.changePercent,
        unit: observation.unit,
        source: observation.source,
        source_label: observation.sourceLabel,
        source_url: observation.sourceUrl,
        feed_timestamp: observation.feedTimestamp,
        retrieved_at: observation.retrievedAt,
        data_status: observation.dataStatus,
      })),
    )
    if (insertError) throw new Error(`Unable to persist cross-asset observations: ${insertError.message}`)
    const { data: published, error: publishError } = await supabase.rpc(
      'publish_cross_asset_snapshot',
      { p_snapshot_id: snapshot.id, p_expected_count: CROSS_ASSET_INSTRUMENT_IDS.length },
    )
    if (publishError || !published) {
      throw new Error(`Unable to publish cross-asset snapshot: ${publishError?.message ?? 'unknown error'}`)
    }
    return {
      id: snapshot.id,
      status: 'complete',
      observations,
      dataAsOf,
      retrievedAt,
      publishedAt: published.published_at ?? new Date().toISOString(),
    }
  } catch (error) {
    await supabase.from('cross_asset_snapshots').update({
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    }).eq('id', snapshot.id)
    throw error
  }
}
