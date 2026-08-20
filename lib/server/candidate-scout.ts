import {
  rankCandidateUniverse,
  selectCandidateBriefs,
  type CandidateFundamentals,
  type CandidateHistory,
} from '../markets/candidates.ts'
import type {
  CandidateBrief,
  CandidateTrackingContext,
  MarketGroupMetric,
  StockLeadershipMetric,
} from '../markets/types.ts'
import { fetchFmpStableJson } from './fmp.ts'
import { normalizeStockLeadershipRow } from './market-leadership.ts'
import { getSupabaseClient } from './supabase.ts'
import { forwardPriceToEarnings, selectForwardAnnualEstimate } from '../markets/valuation.ts'

interface CandidateScoutMaterializationOptions {
  now?: Date
  fetchImpl?: typeof fetch
  targetCount?: number
  tradingDate?: string
  preferredSymbols?: string[]
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
  price: number,
  apiKey: string,
  fetchImpl: typeof fetch,
  now: Date,
): Promise<CandidateFundamentals> {
  const request = <T>(endpoint: string, parameters: Record<string, string | number>) =>
    fetchFmpStableJson<T>(endpoint, { symbol, ...parameters }, { apiKey, fetchImpl })
  const [profileResult, ratiosResult, metricsResult, growthResult, estimatesResult, earningsResult] = await Promise.allSettled([
    request<unknown>('profile', {}),
    request<unknown>('ratios-ttm', {}),
    request<unknown>('key-metrics-ttm', {}),
    request<unknown>('income-statement-growth', { limit: 2 }),
    request<unknown>('analyst-estimates', { period: 'annual', limit: 4 }),
    request<unknown>('earnings', {}),
  ])
  const settled = (value: PromiseSettledResult<unknown>) => value.status === 'fulfilled' ? value.value : []
  const profile = first(settled(profileResult))
  const ratios = first(settled(ratiosResult))
  const metrics = first(settled(metricsResult))
  const growth = first(settled(growthResult))
  const estimates = Array.isArray(settled(estimatesResult))
    ? settled(estimatesResult) as Array<Record<string, unknown>>
    : []
  const earnings = Array.isArray(settled(earningsResult))
    ? settled(earningsResult) as Array<Record<string, unknown>>
    : []
  const today = now.toISOString().slice(0, 10)
  const nextEarningsDate = [
    dateValue(profile.earningsAnnouncement),
    ...earnings.map((item) => dateValue(record(item).date)),
  ].filter((date): date is string => typeof date === 'string' && date >= today)
    .sort()[0] ?? null
  const selectedForwardEstimate = selectForwardAnnualEstimate(estimates, now)
  const futureEstimate = estimates
    .map(record)
    .find((item) => dateValue(item.date) === selectedForwardEstimate?.date)
  const estimateRevenue = number(futureEstimate?.estimatedRevenueAvg)
  const priorRevenue = number(growth.revenueGrowth) !== null
    ? null
    : number(estimates.map(record)[1]?.estimatedRevenueAvg)
  const estimateGrowth = estimateRevenue !== null && priorRevenue !== null && priorRevenue !== 0
    ? (estimateRevenue / priorRevenue - 1) * 100
    : percentValue(futureEstimate?.estimatedRevenueGrowth)

  return {
    symbol,
    company: String(profile.companyName ?? profile.name ?? symbol),
    sector: String(profile.sector ?? 'Unknown'),
    subIndustry: String(profile.industry ?? 'Unknown'),
    marketCap: number(profile.mktCap ?? profile.marketCap),
    peRatio: number(ratios.priceToEarningsRatioTTM ?? ratios.peRatioTTM ?? metrics.peRatioTTM),
    forwardPe: forwardPriceToEarnings(price, selectedForwardEstimate),
    forwardEstimateDate: selectedForwardEstimate?.date ?? null,
    priceToSales: number(ratios.priceToSalesRatioTTM ?? metrics.priceToSalesRatioTTM),
    returnOnEquity: percentValue(ratios.returnOnEquityTTM ?? metrics.roeTTM),
    netMargin: percentValue(ratios.netProfitMarginTTM ?? metrics.netIncomePerEBTTTM),
    debtToEquity: number(ratios.debtToEquityRatioTTM ?? metrics.debtToEquityTTM),
    revenueGrowth: percentValue(growth.growthRevenue ?? growth.revenueGrowth),
    earningsGrowth: percentValue(growth.growthNetIncome ?? growth.netIncomeGrowth),
    estimateGrowth,
    nextEarningsDate,
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
    return5d: nullable(row.return_5d),
    return30d: nullable(row.return_30d),
    return50d: nullable(row.return_50d),
    return200d: nullable(row.return_200d),
    return1y: nullable(row.return_1y),
    vs50DayAverage: nullable(row.vs_50_day_average),
    vs200DayAverage: nullable(row.vs_200_day_average),
  }
}

function leadershipScore(stock: StockLeadershipMetric): number {
  return (
    (stock.return30d ?? -100) * 0.4
    + (stock.vs50DayAverage ?? -100) * 0.3
    + Math.min(stock.relativeVolume ?? 0, 3) * 6
    + (stock.return1y ?? -100) * 0.05
  )
}

function selloffScore(stock: StockLeadershipMetric, tracked: boolean): number {
  const dayThreshold = tracked ? 1.5 : 3
  const fiveDayThreshold = tracked ? 4 : 7
  const monthThreshold = tracked ? 8 : 12
  return Math.max(
    Math.abs(Math.min(stock.dayReturn ?? 0, 0)) / dayThreshold,
    Math.abs(Math.min(stock.return5d ?? 0, 0)) / fiveDayThreshold,
    Math.abs(Math.min(stock.return30d ?? 0, 0)) / monthThreshold,
  )
}

function hasUnnormalizedPriceDiscontinuity(stock: StockLeadershipMetric): boolean {
  return [
    stock.dayReturn,
    stock.return5d,
    stock.return30d,
    stock.return1y,
  ].some((value) => value !== null && value !== undefined && (
    !Number.isFinite(value)
    || value < -100
    || value > 1_000
  ))
}

export function multiLanePrefilter(
  stocks: StockLeadershipMetric[],
  trackingBySymbol: ReadonlyMap<string, CandidateTrackingContext>,
  count = 48,
  preferredSymbols: readonly string[] = [],
): StockLeadershipMetric[] {
  const eligibleStocks = stocks.filter((stock) => !hasUnnormalizedPriceDiscontinuity(stock))
  const selected: StockLeadershipMetric[] = []
  const selectedSymbols = new Set<string>()
  const add = (stock: StockLeadershipMetric) => {
    if (selected.length >= count || selectedSymbols.has(stock.symbol)) return
    selected.push(stock)
    selectedSymbols.add(stock.symbol)
  }
  const tracked = eligibleStocks
    .filter((stock) => {
      const context = trackingBySymbol.get(stock.symbol)
      return Boolean(context?.acceptedThesis || context?.watched || context?.owned)
        && selloffScore(stock, true) >= 1
    })
    .sort((left, right) => selloffScore(right, true) - selloffScore(left, true))
  const marketThesisExposures = eligibleStocks
    .filter((stock) => (trackingBySymbol.get(stock.symbol)?.marketTheses?.length ?? 0) > 0)
    .sort((left, right) => {
      const rightMateriality = Math.max(...(trackingBySymbol.get(right.symbol)?.marketTheses ?? []).map((item) => item.materiality), 0)
      const leftMateriality = Math.max(...(trackingBySymbol.get(left.symbol)?.marketTheses ?? []).map((item) => item.materiality), 0)
      return rightMateriality - leftMateriality
    })
  const dislocations = eligibleStocks
    .filter((stock) => stock.observationCount >= 5 && selloffScore(stock, false) >= 1)
    .sort((left, right) =>
      selloffScore(right, false) - selloffScore(left, false)
      || (right.relativeVolume ?? 0) - (left.relativeVolume ?? 0))
  const leaders = eligibleStocks
    .filter((stock) => stock.observationCount >= 200)
    .sort((left, right) => leadershipScore(right) - leadershipScore(left))
  const eventMovers = eligibleStocks
    .filter((stock) => stock.dayReturn !== null && Math.abs(stock.dayReturn) >= 15)
    .sort((left, right) => Math.abs(right.dayReturn ?? 0) - Math.abs(left.dayReturn ?? 0))

  const bySymbol = new Map(eligibleStocks.map((stock) => [stock.symbol, stock]))
  preferredSymbols.map((symbol) => bySymbol.get(symbol)).filter((stock): stock is StockLeadershipMetric => Boolean(stock)).forEach(add)
  eventMovers.slice(0, 12).forEach(add)
  tracked.slice(0, 16).forEach(add)
  marketThesisExposures.slice(0, 16).forEach(add)
  dislocations.slice(0, 28).forEach(add)
  leaders.slice(0, 24).forEach(add)
  for (const stock of [...dislocations, ...leaders]) add(stock)
  return selected
}

interface ScreenerCandidateRow {
  symbol: string
  company: string
  price: number | string
  daily_change: number | string | null
  return_5d: number | string | null
  return_30d: number | string | null
  return_180d: number | string | null
  return_1y: number | string | null
  relative_volume: number | string | null
  fifty_day_average: number | string | null
  data_as_of: string
}

function historyCount(row: ScreenerCandidateRow): number {
  if (row.return_1y !== null) return 252
  if (row.return_180d !== null) return 180
  if (row.return_30d !== null) return 30
  if (row.return_5d !== null) return 5
  return 2
}

function screenerMetric(row: ScreenerCandidateRow): StockLeadershipMetric {
  const price = Number(row.price)
  const fiftyDayAverage = row.fifty_day_average === null ? null : Number(row.fifty_day_average)
  return {
    symbol: row.symbol,
    company: row.company,
    sector: 'Unknown',
    subIndustry: 'Unknown',
    price,
    dayReturn: row.daily_change === null ? null : Number(row.daily_change),
    return5d: row.return_5d === null ? null : Number(row.return_5d),
    return30d: row.return_30d === null ? null : Number(row.return_30d),
    return50d: null,
    return200d: row.return_180d === null ? null : Number(row.return_180d),
    return1y: row.return_1y === null ? null : Number(row.return_1y),
    vs50DayAverage: fiftyDayAverage && fiftyDayAverage !== 0
      ? (price / fiftyDayAverage - 1) * 100
      : null,
    vs200DayAverage: null,
    relativeVolume: row.relative_volume === null ? null : Number(row.relative_volume),
    observationCount: historyCount(row),
    asOf: row.data_as_of,
  }
}

async function loadExpandedScreenerMetrics(snapshotId: string): Promise<StockLeadershipMetric[]> {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const rows: ScreenerCandidateRow[] = []
  for (let from = 0; ; from += 1_000) {
    const { data, error } = await supabase.from('screener_rows')
      .select('symbol,company,price,daily_change,return_5d,return_30d,return_180d,return_1y,relative_volume,fifty_day_average,data_as_of')
      .eq('snapshot_id', snapshotId)
      .range(from, from + 999)
    if (error) throw new Error(`Unable to load expanded candidate metrics: ${error.message}`)
    const page = (data ?? []) as ScreenerCandidateRow[]
    rows.push(...page)
    if (page.length < 1_000) break
  }
  return rows.map(screenerMetric)
}

function mergeScreenerMetrics(
  leadershipStocks: StockLeadershipMetric[],
  screenerStocks: StockLeadershipMetric[],
): StockLeadershipMetric[] {
  const merged = new Map(leadershipStocks.map((stock) => [stock.symbol, stock]))
  for (const screener of screenerStocks) {
    const leadership = merged.get(screener.symbol)
    if (!leadership) {
      merged.set(screener.symbol, screener)
      continue
    }
    merged.set(screener.symbol, {
      ...leadership,
      price: screener.price,
      dayReturn: screener.dayReturn,
      return5d: screener.return5d,
      return30d: screener.return30d,
      return200d: screener.return200d,
      return1y: screener.return1y,
      vs50DayAverage: screener.vs50DayAverage,
      relativeVolume: screener.relativeVolume,
      observationCount: Math.max(leadership.observationCount, screener.observationCount),
      asOf: screener.asOf,
    })
  }
  return [...merged.values()]
}

async function loadCandidateTracking(): Promise<Map<string, CandidateTrackingContext>> {
  const supabase = getSupabaseClient()
  if (!supabase) return new Map()
  const [{ data: watchlists, error: watchlistError }, { data: positions, error: positionError }, { data: portfolioTransactions, error: portfolioTransactionError }, { data: theses, error: thesisError }] = await Promise.all([
    supabase.from('market_watchlist_items').select('symbol'),
    supabase.from('manual_positions').select('symbol'),
    supabase.from('portfolio_transactions').select('symbol,action,quantity').not('symbol', 'is', null),
    supabase.from('investment_theses').select('symbol')
      .eq('entity_type', 'stock').eq('status', 'accepted').not('symbol', 'is', null),
  ])
  if (watchlistError || positionError || portfolioTransactionError || thesisError) {
    throw new Error(`Unable to load candidate tracking context: ${watchlistError?.message ?? positionError?.message ?? portfolioTransactionError?.message ?? thesisError?.message}`)
  }
  const result = new Map<string, CandidateTrackingContext>()
  const update = (symbol: string, patch: Partial<CandidateTrackingContext>) => {
    result.set(symbol, {
      acceptedThesis: false,
      watched: false,
      owned: false,
      marketTheses: [],
      ...result.get(symbol),
      ...patch,
    })
  }
  for (const row of watchlists ?? []) update(row.symbol, { watched: true })
  for (const row of positions ?? []) update(row.symbol, { owned: true })
  const portfolioShares = new Map<string, number>()
  for (const row of portfolioTransactions ?? []) {
    if (typeof row.symbol !== 'string') continue
    const quantity = Number(row.quantity ?? 0)
    const delta = row.action === 'sell' ? -quantity : row.action === 'buy' || row.action === 'position_import' ? quantity : 0
    portfolioShares.set(row.symbol, (portfolioShares.get(row.symbol) ?? 0) + delta)
  }
  for (const [symbol, shares] of portfolioShares) if (shares > 0.00000001) update(symbol, { owned: true })
  for (const row of theses ?? []) if (typeof row.symbol === 'string') update(row.symbol, { acceptedThesis: true })
  // Market theses are an additional discovery lane, not a capital decision.
  // We only attach a security after an explicit value-chain exposure record
  // exists, preserving the company-level verification requirement.
  const { data: hypotheses, error: hypothesisError } = await supabase.from('market_hypotheses')
    .select('id,title').eq('status', 'active')
  if (hypothesisError) throw new Error(`Unable to load market thesis hypotheses: ${hypothesisError.message}`)
  const hypothesisById = new Map((hypotheses ?? []).map((item) => [item.id, item.title]))
  const hypothesisIds = [...hypothesisById.keys()]
  if (hypothesisIds.length === 0) return result
  const { data: versions, error: versionError } = await supabase.from('market_thesis_versions')
    .select('id,hypothesis_id,version,state').in('hypothesis_id', hypothesisIds).in('state', ['active', 'weakened'])
  if (versionError) throw new Error(`Unable to load market thesis versions: ${versionError.message}`)
  const latestByHypothesis = new Map<string, { id: string; version: number }>()
  for (const row of versions ?? []) {
    const current = latestByHypothesis.get(row.hypothesis_id)
    if (!current || Number(row.version) > current.version) latestByHypothesis.set(row.hypothesis_id, { id: row.id, version: Number(row.version) })
  }
  const versionToHypothesis = new Map([...latestByHypothesis.entries()].map(([hypothesisId, value]) => [value.id, { hypothesisId, version: value.version }]))
  if (versionToHypothesis.size === 0) return result
  const { data: exposures, error: exposureError } = await supabase.from('market_thesis_exposures')
    .select('market_thesis_version_id,symbol,role,mechanism,materiality,verification_status')
    .in('market_thesis_version_id', [...versionToHypothesis.keys()]).not('symbol', 'is', null)
  if (exposureError) throw new Error(`Unable to load market thesis exposures: ${exposureError.message}`)
  for (const exposure of exposures ?? []) {
    if (typeof exposure.symbol !== 'string') continue
    const thesis = versionToHypothesis.get(exposure.market_thesis_version_id)
    if (!thesis) continue
    const existing = result.get(exposure.symbol) ?? { acceptedThesis: false, watched: false, owned: false, marketTheses: [] }
    result.set(exposure.symbol, {
      ...existing,
      marketTheses: [...(existing.marketTheses ?? []), {
        hypothesisId: thesis.hypothesisId,
        title: hypothesisById.get(thesis.hypothesisId) ?? 'Market thesis',
        version: thesis.version,
        mechanism: String(exposure.mechanism),
        materiality: Number(exposure.materiality),
        role: exposure.role as 'beneficiary' | 'loser' | 'substitute',
        verificationStatus: exposure.verification_status as 'verified' | 'needs_company_research' | 'unverified',
      }],
    })
  }
  return result
}

export async function materializeCandidateScout(
  options: CandidateScoutMaterializationOptions = {},
): Promise<CandidateBrief[]> {
  const supabase = getSupabaseClient()
  const apiKey = process.env.FMP_API_KEY?.trim()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  if (!apiKey) throw new Error('FMP_API_KEY is not configured')
  const now = options.now ?? new Date()

  const [
    { data: snapshot, error: snapshotError },
    { data: marketSnapshot, error: marketSnapshotError },
    trackingBySymbol,
  ] = await Promise.all([
    supabase.from('market_leadership_snapshots')
      .select('id,trading_date')
      .eq('status', 'complete')
      .eq('is_latest', true)
      .maybeSingle(),
    supabase.from('market_snapshots')
      .select('id')
      .eq('status', 'complete')
      .eq('is_latest', true)
      .maybeSingle(),
    loadCandidateTracking(),
  ])
  if (snapshotError || !snapshot) throw new Error(`No complete leadership snapshot is available: ${snapshotError?.message ?? 'missing'}`)
  if (marketSnapshotError || !marketSnapshot) throw new Error(`No complete market snapshot is available: ${marketSnapshotError?.message ?? 'missing'}`)
  const [{ data: stockRows, error: stockError }, { data: groupRows, error: groupError }, { data: historyRows, error: historyError }] = await Promise.all([
    supabase.from('market_stock_metrics').select('*').eq('snapshot_id', snapshot.id),
    supabase.from('market_group_metrics').select('*').eq('snapshot_id', snapshot.id).eq('group_type', 'sub_industry'),
    supabase.from('candidate_briefs').select('symbol,trading_date,content').gte('trading_date', new Date(now.getTime() - 14 * 86_400_000).toISOString().slice(0, 10)),
  ])
  if (stockError || groupError || historyError) {
    throw new Error(`Unable to load Candidate Scout inputs: ${stockError?.message ?? groupError?.message ?? historyError?.message}`)
  }
  const leadershipStocks = (stockRows ?? []).map((row) => normalizeStockLeadershipRow(row))
  const screenerStocks = await loadExpandedScreenerMetrics(marketSnapshot.id)
  const stocks = mergeScreenerMetrics(leadershipStocks, screenerStocks)
  const groups = (groupRows ?? []).map((row) => normalizeGroup(row))
  const prefiltered = multiLanePrefilter(stocks, trackingBySymbol, 48, options.preferredSymbols)
  const fundamentals = await Promise.all(prefiltered.map((stock) =>
    fetchCandidateFundamentals(stock.symbol, stock.price, apiKey, options.fetchImpl ?? fetch, now)))
  const fundamentalsBySymbol = new Map(fundamentals.map((item) => [item.symbol, item]))
  const classified = prefiltered.map((stock) => {
    const item = fundamentalsBySymbol.get(stock.symbol)
    return item ? {
      ...stock,
      company: item.company || stock.company,
      sector: item.sector,
      subIndustry: item.subIndustry,
    } : stock
  })
  const history: CandidateHistory[] = (historyRows ?? []).map((row) => {
    const content = record(row.content)
    const signals = Array.isArray(content.signals) ? content.signals.map(record) : []
    return {
      symbol: row.symbol,
      tradingDate: row.trading_date,
      materialKeys: signals.flatMap((signal) => typeof signal.materialKey === 'string' ? [signal.materialKey] : []),
    }
  })
  const ranked = rankCandidateUniverse(classified, groups, fundamentals, 200, trackingBySymbol)
  const tradingDate = options.tradingDate ?? snapshot.trading_date
  const eventPrioritySymbols = (options.preferredSymbols ?? []).filter((symbol) =>
    ranked.some((candidate) => candidate.stock.symbol === symbol && candidate.lanes.includes('event_catalyst')))
  const briefs = selectCandidateBriefs(ranked, {
    tradingDate,
    generatedAt: now.toISOString(),
    targetCount: options.targetCount ?? 8,
    maximumPerSubIndustry: 2,
    suppressionTradingDays: 5,
    history,
    prioritySymbols: eventPrioritySymbols,
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
  return briefs
}
