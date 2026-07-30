import {
  rankCandidateUniverse,
  selectCandidateBriefs,
  type CandidateFundamentals,
  type CandidateHistory,
} from '../markets/candidates.ts'
import {
  buildStockLeadershipMetrics,
  type LeadershipCompany,
  type LeadershipPriceBar,
} from '../markets/leadership.ts'
import type { CandidateBrief, MarketGroupMetric, StockLeadershipMetric } from '../markets/types.ts'
import { fetchFmpStableJson } from './fmp.ts'
import { normalizeStockLeadershipRow } from './market-leadership.ts'
import { getSupabaseClient } from './supabase.ts'
import { proposeIndustryTheses } from './theses.ts'

interface CandidateScoutMaterializationOptions {
  now?: Date
  fetchImpl?: typeof fetch
  targetCount?: number
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function first(value: unknown): Record<string, unknown> {
  return Array.isArray(value) ? record(value[0]) : record(value)
}

function number(value: unknown): number | null {
  const result = Number(value)
  return Number.isFinite(result) ? result : null
}

function percentValue(value: unknown): number | null {
  const result = number(value)
  if (result === null) return null
  return Math.abs(result) <= 1.5 ? result * 100 : result
}

function dateValue(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null
  return value.slice(0, 10)
}

async function fetchCandidateFundamentals(
  symbol: string,
  apiKey: string,
  fetchImpl: typeof fetch,
  now: Date,
): Promise<CandidateFundamentals> {
  const request = <T>(endpoint: string, parameters: Record<string, string | number>) =>
    fetchFmpStableJson<T>(endpoint, { symbol, ...parameters }, { apiKey, fetchImpl })
  const [profileResult, ratiosResult, metricsResult, growthResult, estimatesResult] = await Promise.allSettled([
    request<unknown>('profile', {}),
    request<unknown>('ratios-ttm', {}),
    request<unknown>('key-metrics-ttm', {}),
    request<unknown>('income-statement-growth', { limit: 2 }),
    request<unknown>('analyst-estimates', { period: 'annual', limit: 4 }),
  ])
  const settled = (value: PromiseSettledResult<unknown>) => value.status === 'fulfilled' ? value.value : []
  const profile = first(settled(profileResult))
  const ratios = first(settled(ratiosResult))
  const metrics = first(settled(metricsResult))
  const growth = first(settled(growthResult))
  const estimates = Array.isArray(settled(estimatesResult))
    ? settled(estimatesResult) as Array<Record<string, unknown>>
    : []
  const futureEstimate = estimates
    .map(record)
    .filter((item) => dateValue(item.date))
    .sort((left, right) => String(left.date).localeCompare(String(right.date)))[0]
  const estimateRevenue = number(futureEstimate?.estimatedRevenueAvg)
  const priorRevenue = number(growth.revenueGrowth) !== null
    ? null
    : number(estimates.map(record)[1]?.estimatedRevenueAvg)
  const estimateGrowth = estimateRevenue !== null && priorRevenue !== null && priorRevenue !== 0
    ? (estimateRevenue / priorRevenue - 1) * 100
    : percentValue(futureEstimate?.estimatedRevenueGrowth)

  return {
    symbol,
    marketCap: number(profile.mktCap ?? profile.marketCap),
    peRatio: number(ratios.priceToEarningsRatioTTM ?? ratios.peRatioTTM ?? metrics.peRatioTTM),
    priceToSales: number(ratios.priceToSalesRatioTTM ?? metrics.priceToSalesRatioTTM),
    returnOnEquity: percentValue(ratios.returnOnEquityTTM ?? metrics.roeTTM),
    netMargin: percentValue(ratios.netProfitMarginTTM ?? metrics.netIncomePerEBTTTM),
    debtToEquity: number(ratios.debtToEquityRatioTTM ?? metrics.debtToEquityTTM),
    revenueGrowth: percentValue(growth.growthRevenue ?? growth.revenueGrowth),
    earningsGrowth: percentValue(growth.growthNetIncome ?? growth.netIncomeGrowth),
    estimateGrowth,
    nextEarningsDate: dateValue(profile.earningsAnnouncement ?? futureEstimate?.date),
    profileUrl: `https://financialmodelingprep.com/stable/profile?symbol=${encodeURIComponent(symbol)}`,
    fundamentalsAsOf: now.toISOString(),
  }
}

function normalizeGroup(row: Record<string, unknown>): MarketGroupMetric {
  const nullable = (value: unknown) => value === null || value === undefined ? null : Number(value)
  return {
    groupType: row.group_type as MarketGroupMetric['groupType'],
    label: String(row.label),
    sector: row.group_type === 'sector' ? null : String(row.sector),
    constituentCount: Number(row.constituent_count),
    dayReturn: nullable(row.day_return),
    return30d: nullable(row.return_30d),
    return50d: nullable(row.return_50d),
    return200d: nullable(row.return_200d),
    return1y: nullable(row.return_1y),
    vs50DayAverage: nullable(row.vs_50_day_average),
    vs200DayAverage: nullable(row.vs_200_day_average),
  }
}

function technicalPrefilter(stocks: StockLeadershipMetric[], count = 36): StockLeadershipMetric[] {
  const score = (stock: StockLeadershipMetric) =>
    (stock.return30d ?? -100) * 0.4
    + (stock.vs50DayAverage ?? -100) * 0.3
    + Math.min(stock.relativeVolume ?? 0, 3) * 6
    + (stock.return1y ?? -100) * 0.05
  return stocks
    .filter((stock) => stock.observationCount >= 200 && (stock.return30d ?? -Infinity) > -5)
    .sort((left, right) => score(right) - score(left))
    .slice(0, count)
}

async function loadTrackedStockMetrics(
  existing: StockLeadershipMetric[],
  apiKey: string,
  fetchImpl: typeof fetch,
  now: Date,
): Promise<StockLeadershipMetric[]> {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const [{ data: listItems }, { data: positions }, { data: marketSnapshot }] = await Promise.all([
    supabase.from('market_watchlist_items').select('symbol,market_watchlists!inner(owner_id)')
      .not('market_watchlists.owner_id', 'is', null),
    supabase.from('manual_positions').select('symbol'),
    supabase.from('market_snapshots').select('id,feed').eq('status', 'complete').eq('is_latest', true).maybeSingle(),
  ])
  if (!marketSnapshot) return []
  const existingSymbols = new Set(existing.map((stock) => stock.symbol))
  const symbols = [...new Set([
    ...(listItems ?? []).map((item) => item.symbol),
    ...(positions ?? []).map((item) => item.symbol),
  ])].filter((symbol) => !existingSymbols.has(symbol))
  if (symbols.length === 0) return []

  const companies: LeadershipCompany[] = await Promise.all(symbols.map(async (symbol) => {
    const profile = first(await fetchFmpStableJson<unknown>('profile', { symbol }, { apiKey, fetchImpl }))
    return {
      symbol,
      company: String(profile.companyName ?? profile.name ?? symbol),
      sector: String(profile.sector ?? 'Unknown'),
      subIndustry: String(profile.industry ?? 'Unknown'),
    }
  }))
  const start = new Date(now)
  start.setUTCDate(start.getUTCDate() - 430)
  const bars: LeadershipPriceBar[] = []
  for (let from = 0; ; from += 1_000) {
    const { data, error } = await supabase.from('market_bars_daily').select('symbol,trading_date,close')
      .in('symbol', symbols).eq('feed', marketSnapshot.feed).gte('trading_date', start.toISOString().slice(0, 10))
      .order('trading_date', { ascending: true }).range(from, from + 999)
    if (error) throw new Error(`Unable to load tracked-name history: ${error.message}`)
    const page = data ?? []
    bars.push(...page.map((bar) => ({
      symbol: bar.symbol,
      tradingDate: bar.trading_date,
      close: Number(bar.close),
    })))
    if (page.length < 1_000) break
  }
  const { data: screenerRows, error: screenerError } = await supabase.from('screener_rows')
    .select('symbol,relative_volume').eq('snapshot_id', marketSnapshot.id).in('symbol', symbols)
  if (screenerError) throw new Error(`Unable to load tracked-name snapshots: ${screenerError.message}`)
  const relativeVolumeBySymbol = new Map(
    (screenerRows ?? []).map((row) => [row.symbol, Number(row.relative_volume)]),
  )
  return buildStockLeadershipMetrics(companies, bars, { relativeVolumeBySymbol })
}

export async function materializeCandidateScout(
  options: CandidateScoutMaterializationOptions = {},
): Promise<CandidateBrief[]> {
  const supabase = getSupabaseClient()
  const apiKey = process.env.FMP_API_KEY?.trim()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  if (!apiKey) throw new Error('FMP_API_KEY is not configured')
  const now = options.now ?? new Date()

  const { data: snapshot, error: snapshotError } = await supabase
    .from('market_leadership_snapshots')
    .select('id,trading_date')
    .eq('status', 'complete')
    .eq('is_latest', true)
    .maybeSingle()
  if (snapshotError || !snapshot) throw new Error(`No complete leadership snapshot is available: ${snapshotError?.message ?? 'missing'}`)
  const [{ data: stockRows, error: stockError }, { data: groupRows, error: groupError }, { data: historyRows, error: historyError }] = await Promise.all([
    supabase.from('market_stock_metrics').select('*').eq('snapshot_id', snapshot.id),
    supabase.from('market_group_metrics').select('*').eq('snapshot_id', snapshot.id).eq('group_type', 'sub_industry'),
    supabase.from('candidate_briefs').select('symbol,trading_date,content').gte('trading_date', new Date(now.getTime() - 14 * 86_400_000).toISOString().slice(0, 10)),
  ])
  if (stockError || groupError || historyError) {
    throw new Error(`Unable to load Candidate Scout inputs: ${stockError?.message ?? groupError?.message ?? historyError?.message}`)
  }
  const leadershipStocks = (stockRows ?? []).map((row) => normalizeStockLeadershipRow(row))
  const trackedStocks = await loadTrackedStockMetrics(
    leadershipStocks,
    apiKey,
    options.fetchImpl ?? fetch,
    now,
  )
  const stocks = [...leadershipStocks, ...trackedStocks]
  const groups = (groupRows ?? []).map((row) => normalizeGroup(row))
  const prefiltered = technicalPrefilter(stocks)
  const fundamentals = await Promise.all(prefiltered.map((stock) =>
    fetchCandidateFundamentals(stock.symbol, apiKey, options.fetchImpl ?? fetch, now)))
  const history: CandidateHistory[] = (historyRows ?? []).map((row) => {
    const content = record(row.content)
    const signals = Array.isArray(content.signals) ? content.signals.map(record) : []
    return {
      symbol: row.symbol,
      tradingDate: row.trading_date,
      materialKeys: signals.flatMap((signal) => typeof signal.materialKey === 'string' ? [signal.materialKey] : []),
    }
  })
  const ranked = rankCandidateUniverse(prefiltered, groups, fundamentals)
  const briefs = selectCandidateBriefs(ranked, {
    tradingDate: snapshot.trading_date,
    generatedAt: now.toISOString(),
    targetCount: options.targetCount ?? 5,
    maximumPerSubIndustry: 2,
    suppressionTradingDays: 5,
    history,
  })
  if (briefs.length < 3) throw new Error(`Candidate Scout produced only ${briefs.length} eligible briefs`)

  for (const brief of briefs) {
    const { error } = await supabase.from('candidate_briefs').upsert({
      id: brief.id,
      symbol: brief.symbol,
      leadership_snapshot_id: snapshot.id,
      trading_date: brief.tradingDate,
      company: brief.company,
      sector: brief.sector,
      sub_industry: brief.subIndustry,
      why_surfaced: brief.whySurfaced,
      content: brief,
      status: brief.status,
      generated_at: brief.generatedAt,
    }, { onConflict: 'id' })
    if (error) throw new Error(`Unable to persist candidate ${brief.symbol}: ${error.message}`)
    const { error: signalError } = await supabase.from('candidate_signals').upsert(brief.signals.map((signal) => ({
      candidate_id: brief.id,
      kind: signal.kind,
      summary: signal.summary,
      material_key: signal.materialKey,
    })), { onConflict: 'candidate_id,kind,material_key' })
    if (signalError) throw new Error(`Unable to persist candidate signals for ${brief.symbol}: ${signalError.message}`)
  }
  const [{ data: marketUsers }, { data: watchlistOwners }, { data: positionOwners }] = await Promise.all([
    supabase.from('market_users').select('id'),
    supabase.from('market_watchlists').select('owner_id').not('owner_id', 'is', null),
    supabase.from('manual_positions').select('owner_id'),
  ])
  const owners = new Set([
    ...(marketUsers ?? []).map((row) => row.id),
    ...(watchlistOwners ?? []).map((row) => row.owner_id),
    ...(positionOwners ?? []).map((row) => row.owner_id),
  ].filter((owner): owner is string => typeof owner === 'string'))
  for (const ownerId of owners) {
    const { error } = await supabase.from('decision_inbox_items').upsert(briefs.map((brief) => ({
      owner_id: ownerId,
      item_type: 'new_candidate',
      symbol: brief.symbol,
      title: `${brief.symbol} surfaced in Candidate Scout`,
      summary: brief.whySurfaced,
      evidence: brief.evidence,
      dedupe_key: `candidate:${brief.id}`,
      occurred_at: brief.generatedAt,
    })), { onConflict: 'owner_id,dedupe_key', ignoreDuplicates: true })
    if (error) throw new Error(`Unable to publish candidate inbox items: ${error.message}`)
    await proposeIndustryTheses(ownerId, briefs)
  }
  return briefs
}
