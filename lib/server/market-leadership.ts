import {
  aggregateLeadershipGroups,
  applyCurrentDayReturns,
  buildMarketLeadershipSnapshot,
  type LeadershipCompany,
  type LeadershipPriceBar,
} from '../markets/leadership.ts'
import type {
  MarketGroupMetric,
  MarketLeadershipSnapshot,
  StockLeadershipMetric,
} from '../markets/types.ts'
import { getSupabaseClient } from './supabase.ts'

const DATABASE_PAGE_SIZE = 1_000
const DATABASE_BATCH_SIZE = 500
const GICS_CONSTITUENTS_URL = 'https://raw.githubusercontent.com/datasets/s-and-p-500-companies/main/data/constituents.csv'

function batches<T>(items: T[], size = DATABASE_BATCH_SIZE): T[][] {
  const result: T[][] = []
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size))
  return result
}

function parseCsvRow(row: string): string[] {
  const values: string[] = []
  let current = ''
  let quoted = false
  for (let index = 0; index < row.length; index += 1) {
    const character = row[index]!
    if (character === '"') {
      if (quoted && row[index + 1] === '"') {
        current += '"'
        index += 1
      } else {
        quoted = !quoted
      }
    } else if (character === ',' && !quoted) {
      values.push(current)
      current = ''
    } else {
      current += character
    }
  }
  values.push(current)
  return values
}

export function parseGicsConstituents(csv: string): LeadershipCompany[] {
  const rows = csv.trim().split(/\r?\n/).filter(Boolean)
  if (rows.length < 2) return []
  const headers = parseCsvRow(rows[0]!).map((value) => value.trim())
  const index = (names: string[]) => headers.findIndex((header) => names.includes(header))
  const symbolIndex = index(['Symbol', 'Ticker'])
  const companyIndex = index(['Security', 'Company'])
  const sectorIndex = index(['GICS Sector', 'Sector'])
  const subIndustryIndex = index(['GICS Sub-Industry', 'Sub-Industry', 'Sub Industry'])
  if ([symbolIndex, companyIndex, sectorIndex, subIndustryIndex].some((value) => value < 0)) {
    throw new Error('GICS constituents CSV is missing required columns')
  }
  return rows.slice(1).flatMap((row) => {
    const values = parseCsvRow(row)
    const symbol = values[symbolIndex]?.trim().toUpperCase().replaceAll('.', '-')
    if (!symbol) return []
    return [{
      symbol,
      company: values[companyIndex]?.trim() || symbol,
      sector: values[sectorIndex]?.trim() || 'Unknown',
      subIndustry: values[subIndustryIndex]?.trim() || 'Unknown',
    }]
  })
}

export function renderLeadershipSlack(snapshot: MarketLeadershipSnapshot): string {
  const format = (value: number | null) => value === null ? 'n/a' : `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`
  const table = (groups: MarketGroupMetric[]) => groups.map((group) =>
    `• ${group.label} (${group.constituentCount}) · 30d ${format(group.return30d)} · 1yr ${format(group.return1y)} · vs200 ${format(group.vs200DayAverage)}`,
  ).join('\n')
  return [
    `*Market Moves — ${snapshot.tradingDate}*`,
    '',
    '*Sub-industry leaders*',
    table(snapshot.subIndustries.slice(0, 8)),
    '',
    '*Sub-industry laggards*',
    table(snapshot.subIndustries.slice(-8).reverse()),
    '',
    `*Breadth* · ${snapshot.advancingPercent.toFixed(1)}% advancing · ${snapshot.above50DayPercent.toFixed(1)}% above 50d`,
    `*Data quality* · ${snapshot.usableCount}/${snapshot.universeCount} usable · ${snapshot.freshCount} current`,
  ].join('\n')
}

interface LeadershipMaterializationOptions {
  fetchImpl?: typeof fetch
  now?: Date
}

interface PersistedBar {
  symbol: string
  trading_date: string
  close: number | string
}

interface ScreenerSnapshotMetric {
  symbol: string
  relative_volume: number | string
  daily_change: number | string | null
}

async function loadAllRows<T>(
  loader: (from: number, to: number) => Promise<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += DATABASE_PAGE_SIZE) {
    const { data, error } = await loader(from, from + DATABASE_PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    const page = data ?? []
    rows.push(...page)
    if (page.length < DATABASE_PAGE_SIZE) break
  }
  return rows
}

export async function materializeMarketLeadership(
  options: LeadershipMaterializationOptions = {},
): Promise<MarketLeadershipSnapshot> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const now = options.now ?? new Date()

  const [{ data: universeRows, error: universeError }, { data: snapshot, error: snapshotError }, taxonomyResponse] = await Promise.all([
    supabase.from('market_universe_members').select('symbol').eq('universe', 'sp500').eq('active', true),
    supabase.from('market_snapshots').select('id,feed').eq('status', 'complete').eq('is_latest', true).maybeSingle(),
    (options.fetchImpl ?? fetch)(GICS_CONSTITUENTS_URL, {
      headers: { 'User-Agent': 'Stratum/0.4 (+market-structure-worker)' },
      signal: AbortSignal.timeout(15_000),
    }),
  ])
  if (universeError) throw new Error(`Unable to load leadership universe: ${universeError.message}`)
  if (snapshotError || !snapshot) throw new Error(`Unable to load current market snapshot: ${snapshotError?.message ?? 'missing'}`)
  if (!taxonomyResponse.ok) throw new Error(`Unable to load GICS taxonomy: ${taxonomyResponse.status}`)

  const universe = new Set((universeRows ?? []).map((row) => row.symbol))
  if (universe.size < 450) throw new Error(`Leadership universe has only ${universe.size} active symbols`)
  const companies = parseGicsConstituents(await taxonomyResponse.text()).filter((company) => universe.has(company.symbol))
  if (companies.length < 450) throw new Error(`GICS taxonomy matched only ${companies.length} universe symbols`)

  const symbols = companies.map((company) => company.symbol)
  const start = new Date(now)
  start.setUTCDate(start.getUTCDate() - 430)
  const [persistedBars, screenerMetrics] = await Promise.all([
    loadAllRows<PersistedBar>(async (from, to) => await supabase
      .from('market_bars_daily')
      .select('symbol,trading_date,close')
      .in('symbol', symbols)
      .eq('feed', snapshot.feed)
      .gte('trading_date', start.toISOString().slice(0, 10))
      .order('trading_date', { ascending: true })
      .range(from, to)),
    loadAllRows<ScreenerSnapshotMetric>(async (from, to) => await supabase
      .from('screener_rows')
      .select('symbol,relative_volume,daily_change')
      .eq('snapshot_id', snapshot.id)
      .range(from, to)),
  ])
  const bars: LeadershipPriceBar[] = persistedBars.map((bar) => ({
    symbol: bar.symbol,
    tradingDate: bar.trading_date,
    close: Number(bar.close),
  }))
  const relativeVolumeBySymbol = new Map(screenerMetrics.map((row) => [row.symbol, Number(row.relative_volume)]))
  const dayReturnBySymbol = new Map(screenerMetrics.flatMap((row) => {
    const value = row.daily_change === null ? Number.NaN : Number(row.daily_change)
    return Number.isFinite(value) ? [[row.symbol, value] as const] : []
  }))
  const baseArtifact = buildMarketLeadershipSnapshot(companies, bars, {
    generatedAt: now.toISOString(),
    relativeVolumeBySymbol,
  })
  const stocks = applyCurrentDayReturns(baseArtifact.stocks, dayReturnBySymbol)
  const sectors = aggregateLeadershipGroups(stocks, 'sector')
    .sort((left, right) => (right.return1y ?? -Infinity) - (left.return1y ?? -Infinity))
  const subIndustries = aggregateLeadershipGroups(stocks, 'sub_industry')
    .filter((group) => group.constituentCount >= 2)
    .sort((left, right) => (right.return1y ?? -Infinity) - (left.return1y ?? -Infinity))
  const artifact: MarketLeadershipSnapshot = {
    ...baseArtifact,
    stocks,
    sectors,
    subIndustries,
    advancingPercent: Math.round((stocks.filter((stock) => (stock.dayReturn ?? 0) > 0).length / stocks.length) * 10_000) / 100,
  }

  const { data: record, error: createError } = await supabase
    .from('market_leadership_snapshots')
    .insert({
      trading_date: artifact.tradingDate,
      status: 'building',
      data_as_of: artifact.dataAsOf,
      universe_count: artifact.universeCount,
      fresh_count: artifact.freshCount,
      advancing_percent: artifact.advancingPercent,
      above_50_day_percent: artifact.above50DayPercent,
      generated_at: artifact.generatedAt,
    })
    .select('id')
    .single()
  if (createError || !record) throw new Error(`Unable to create leadership snapshot: ${createError?.message ?? 'unknown error'}`)
  artifact.id = record.id

  try {
    for (const batch of batches(artifact.stocks)) {
      const { error } = await supabase.from('market_stock_metrics').insert(batch.map((stock) => ({
        snapshot_id: record.id,
        symbol: stock.symbol,
        company: stock.company,
        sector: stock.sector,
        sub_industry: stock.subIndustry,
        price: stock.price,
        day_return: stock.dayReturn,
        return_30d: stock.return30d,
        return_50d: stock.return50d,
        return_200d: stock.return200d,
        return_1y: stock.return1y,
        vs_50_day_average: stock.vs50DayAverage,
        vs_200_day_average: stock.vs200DayAverage,
        relative_volume: stock.relativeVolume,
        observation_count: stock.observationCount,
        data_as_of: stock.asOf,
      })))
      if (error) throw new Error(`Unable to persist leadership stocks: ${error.message}`)
    }
    const groups = [...artifact.sectors, ...artifact.subIndustries]
    const { error: groupError } = await supabase.from('market_group_metrics').insert(groups.map((group) => ({
      snapshot_id: record.id,
      group_type: group.groupType,
      label: group.label,
      sector: group.sector ?? '',
      constituent_count: group.constituentCount,
      day_return: group.dayReturn,
      return_30d: group.return30d,
      return_50d: group.return50d,
      return_200d: group.return200d,
      return_1y: group.return1y,
      vs_50_day_average: group.vs50DayAverage,
      vs_200_day_average: group.vs200DayAverage,
    })))
    if (groupError) throw new Error(`Unable to persist leadership groups: ${groupError.message}`)
    const { error: divergenceError } = await supabase.from('market_divergence_signals').insert(artifact.divergences.map((signal) => ({
      snapshot_id: record.id,
      signal_id: signal.id,
      scope: signal.scope,
      symbol: signal.symbol,
      group_label: signal.groupLabel,
      near_term_return: signal.nearTermReturn,
      long_term_return: signal.longTermReturn,
      spread: signal.spread,
      summary: signal.summary,
    })))
    if (divergenceError) throw new Error(`Unable to persist leadership divergences: ${divergenceError.message}`)
    const { error: publishError } = await supabase.rpc('publish_market_leadership_snapshot', { p_snapshot_id: record.id })
    if (publishError) throw new Error(`Unable to publish leadership snapshot: ${publishError.message}`)
    return artifact
  } catch (error) {
    await supabase.from('market_leadership_snapshots').update({
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    }).eq('id', record.id)
    throw error
  }
}

export function normalizeStockLeadershipRow(row: Record<string, unknown>): StockLeadershipMetric {
  const numberOrNull = (value: unknown) => value === null || value === undefined ? null : Number(value)
  return {
    symbol: String(row.symbol),
    company: String(row.company),
    sector: String(row.sector),
    subIndustry: String(row.sub_industry),
    price: Number(row.price),
    dayReturn: numberOrNull(row.day_return),
    return5d: numberOrNull(row.return_5d),
    return30d: numberOrNull(row.return_30d),
    return50d: numberOrNull(row.return_50d),
    return200d: numberOrNull(row.return_200d),
    return1y: numberOrNull(row.return_1y),
    vs50DayAverage: numberOrNull(row.vs_50_day_average),
    vs200DayAverage: numberOrNull(row.vs_200_day_average),
    relativeVolume: numberOrNull(row.relative_volume),
    observationCount: Number(row.observation_count),
    asOf: String(row.data_as_of),
  }
}
