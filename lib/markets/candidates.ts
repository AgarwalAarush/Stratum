import type {
  CandidateBrief,
  CandidateDimension,
  CandidateSignal,
  MarketGroupMetric,
  StockLeadershipMetric,
} from './types.ts'

export interface CandidateFundamentals {
  symbol: string
  marketCap: number | null
  peRatio: number | null
  priceToSales: number | null
  returnOnEquity: number | null
  netMargin: number | null
  debtToEquity: number | null
  revenueGrowth: number | null
  earningsGrowth: number | null
  estimateGrowth: number | null
  nextEarningsDate: string | null
  profileUrl: string
  fundamentalsAsOf: string
}

export interface CandidateHistory {
  symbol: string
  tradingDate: string
  materialKeys: string[]
}

export interface CandidateScoutOptions {
  tradingDate: string
  generatedAt?: string
  minimumHistory?: number
  targetCount?: number
  maximumPerSubIndustry?: number
  suppressionTradingDays?: number
  history?: CandidateHistory[]
}

export interface RankedCandidate {
  stock: StockLeadershipMetric
  fundamentals: CandidateFundamentals
  group: MarketGroupMetric | null
  signals: CandidateSignal[]
  dimensions: CandidateDimension[]
  attentionPriority: number
}

function finite(value: number | null): value is number {
  return value !== null && Number.isFinite(value)
}

function formatPercent(value: number | null): string {
  return finite(value) ? `${value >= 0 ? '+' : ''}${value.toFixed(1)}%` : 'Unavailable'
}

function formatMultiple(value: number | null): string {
  return finite(value) ? `${value.toFixed(1)}×` : 'Unavailable'
}

function tradingDateDistance(left: string, right: string): number {
  const start = new Date(`${left < right ? left : right}T00:00:00.000Z`)
  const end = new Date(`${left < right ? right : left}T00:00:00.000Z`)
  let count = 0
  for (const cursor = new Date(start); cursor < end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const day = cursor.getUTCDay()
    if (day !== 0 && day !== 6) count += 1
  }
  return count
}

function candidateSignals(
  stock: StockLeadershipMetric,
  group: MarketGroupMetric | null,
  fundamentals: CandidateFundamentals,
): CandidateSignal[] {
  const signals: CandidateSignal[] = []
  if (finite(stock.return30d) && finite(stock.return1y) && stock.return30d > 5 && stock.return1y <= 5) {
    signals.push({
      kind: 'leadership_transition',
      summary: `${stock.symbol} has moved into near-term leadership after a muted longer-term trend.`,
      materialKey: `transition:${Math.round(stock.return30d / 5) * 5}`,
    })
  }
  if (group && finite(stock.return30d) && finite(group.return30d) && stock.return30d - group.return30d >= 8) {
    signals.push({
      kind: 'company_group_divergence',
      summary: `${stock.symbol} is outperforming ${stock.subIndustry} by ${(stock.return30d - group.return30d).toFixed(1)} percentage points over 30 days.`,
      materialKey: `group-divergence:${Math.round((stock.return30d - group.return30d) / 5) * 5}`,
    })
  }
  if (
    finite(stock.return30d)
    && finite(stock.vs50DayAverage)
    && stock.return30d > 3
    && stock.vs50DayAverage > 0
    && (stock.relativeVolume ?? 0) >= 1.15
  ) {
    signals.push({
      kind: 'price_volume_confirmation',
      summary: `Positive 30-day momentum is confirmed by ${stock.relativeVolume!.toFixed(1)}× relative volume and price above the 50-day average.`,
      materialKey: `price-volume:${Math.floor(stock.relativeVolume! * 2) / 2}`,
    })
  }
  if (finite(fundamentals.peRatio) && fundamentals.peRatio > 0 && fundamentals.peRatio <= 25 && (fundamentals.estimateGrowth ?? fundamentals.earningsGrowth ?? 0) > 8) {
    signals.push({
      kind: 'relative_valuation',
      summary: `Growth remains positive while the current P/E is ${fundamentals.peRatio.toFixed(1)}×.`,
      materialKey: `valuation:${Math.round(fundamentals.peRatio / 5) * 5}`,
    })
  }
  if ((fundamentals.estimateGrowth ?? 0) >= 10 || fundamentals.nextEarningsDate) {
    signals.push({
      kind: 'earnings_or_estimate_catalyst',
      summary: fundamentals.nextEarningsDate
        ? `The next reported earnings date is ${fundamentals.nextEarningsDate}.`
        : `Forward estimate growth is ${formatPercent(fundamentals.estimateGrowth)}.`,
      materialKey: `catalyst:${fundamentals.nextEarningsDate ?? Math.round((fundamentals.estimateGrowth ?? 0) / 5) * 5}`,
    })
  }
  if (
    (fundamentals.returnOnEquity ?? 0) >= 15
    && (fundamentals.netMargin ?? 0) >= 8
    && (fundamentals.revenueGrowth ?? 0) > 0
  ) {
    signals.push({
      kind: 'quality_improvement',
      summary: `Profitability and growth screen positively: ${formatPercent(fundamentals.returnOnEquity)} ROE and ${formatPercent(fundamentals.revenueGrowth)} revenue growth.`,
      materialKey: `quality:${Math.round((fundamentals.returnOnEquity ?? 0) / 5) * 5}`,
    })
  }
  return signals
}

function assessment(
  value: number | null,
  strong: (value: number) => boolean,
  positive: (value: number) => boolean,
  caution: (value: number) => boolean,
): CandidateDimension['assessment'] {
  if (!finite(value)) return 'mixed'
  if (strong(value)) return 'strong'
  if (positive(value)) return 'positive'
  if (caution(value)) return 'caution'
  return 'mixed'
}

function candidateDimensions(
  stock: StockLeadershipMetric,
  fundamentals: CandidateFundamentals,
): CandidateDimension[] {
  const qualityValue = finite(fundamentals.returnOnEquity) && finite(fundamentals.netMargin)
    ? (fundamentals.returnOnEquity + fundamentals.netMargin) / 2
    : fundamentals.returnOnEquity ?? fundamentals.netMargin
  const growthValue = fundamentals.estimateGrowth ?? fundamentals.earningsGrowth ?? fundamentals.revenueGrowth
  const valuationValue = fundamentals.peRatio
  const setupValue = finite(stock.vs50DayAverage) && finite(stock.return30d)
    ? stock.vs50DayAverage + stock.return30d
    : stock.return30d
  const leverage = fundamentals.debtToEquity
  return [
    {
      name: 'business_quality',
      label: 'Business quality',
      assessment: assessment(qualityValue, (v) => v >= 20, (v) => v >= 10, (v) => v < 0),
      evidence: `${formatPercent(fundamentals.returnOnEquity)} ROE · ${formatPercent(fundamentals.netMargin)} net margin`,
    },
    {
      name: 'growth',
      label: 'Growth',
      assessment: assessment(growthValue, (v) => v >= 15, (v) => v >= 5, (v) => v < 0),
      evidence: `${formatPercent(fundamentals.revenueGrowth)} revenue · ${formatPercent(fundamentals.estimateGrowth)} estimates`,
    },
    {
      name: 'valuation',
      label: 'Valuation',
      assessment: assessment(valuationValue, (v) => v > 0 && v <= 20, (v) => v <= 30, (v) => v <= 0 || v > 45),
      evidence: `${formatMultiple(fundamentals.peRatio)} P/E · ${formatMultiple(fundamentals.priceToSales)} sales`,
    },
    {
      name: 'price_setup',
      label: 'Price setup',
      assessment: assessment(setupValue, (v) => v >= 15, (v) => v >= 3, (v) => v < -5),
      evidence: `${formatPercent(stock.return30d)} over 30d · ${formatPercent(stock.vs50DayAverage)} vs 50d`,
    },
    {
      name: 'catalyst',
      label: 'Catalyst',
      assessment: fundamentals.nextEarningsDate || (fundamentals.estimateGrowth ?? 0) > 8 ? 'positive' : 'mixed',
      evidence: fundamentals.nextEarningsDate ? `Earnings ${fundamentals.nextEarningsDate}` : `${formatPercent(fundamentals.estimateGrowth)} estimate growth`,
    },
    {
      name: 'risk',
      label: 'Risk',
      assessment: assessment(leverage, (v) => v >= 0 && v <= 0.5, (v) => v <= 1.5, (v) => v > 2.5),
      evidence: `${finite(leverage) ? leverage.toFixed(2) : 'Unavailable'} debt/equity · ${formatPercent(stock.vs200DayAverage)} vs 200d`,
    },
  ]
}

function priority(dimensions: CandidateDimension[], signals: CandidateSignal[]): number {
  const dimensionValue = { strong: 3, positive: 2, mixed: 1, caution: 0 }
  return dimensions.reduce((sum, dimension) => sum + dimensionValue[dimension.assessment], 0) + signals.length * 2
}

export function rankCandidateUniverse(
  stocks: StockLeadershipMetric[],
  groups: MarketGroupMetric[],
  fundamentals: CandidateFundamentals[],
  minimumHistory = 200,
): RankedCandidate[] {
  const groupByKey = new Map(groups.map((group) => [`${group.sector}\u0000${group.label}`, group]))
  const fundamentalsBySymbol = new Map(fundamentals.map((item) => [item.symbol, item]))
  return stocks.flatMap((stock) => {
    const companyFundamentals = fundamentalsBySymbol.get(stock.symbol)
    if (!companyFundamentals || stock.observationCount < minimumHistory) return []
    const group = groupByKey.get(`${stock.sector}\u0000${stock.subIndustry}`) ?? null
    const signals = candidateSignals(stock, group, companyFundamentals)
    if (signals.length < 2) return []
    const dimensions = candidateDimensions(stock, companyFundamentals)
    return [{ stock, fundamentals: companyFundamentals, group, signals, dimensions, attentionPriority: priority(dimensions, signals) }]
  }).sort((left, right) =>
    right.attentionPriority - left.attentionPriority
    || (right.stock.return30d ?? -Infinity) - (left.stock.return30d ?? -Infinity)
    || left.stock.symbol.localeCompare(right.stock.symbol))
}

export function selectCandidateBriefs(
  ranked: RankedCandidate[],
  options: CandidateScoutOptions,
): CandidateBrief[] {
  const targetCount = options.targetCount ?? 5
  const maximumPerSubIndustry = options.maximumPerSubIndustry ?? 2
  const suppressionTradingDays = options.suppressionTradingDays ?? 5
  const history = options.history ?? []
  const groupCounts = new Map<string, number>()
  const selected: RankedCandidate[] = []

  for (const candidate of ranked) {
    const prior = history
      .filter((item) => item.symbol === candidate.stock.symbol)
      .sort((left, right) => right.tradingDate.localeCompare(left.tradingDate))[0]
    const currentKeys = candidate.signals.map((signal) => signal.materialKey)
    const repeated = prior
      && tradingDateDistance(prior.tradingDate, options.tradingDate) < suppressionTradingDays
      && currentKeys.every((key) => prior.materialKeys.includes(key))
    if (repeated) continue
    const groupKey = `${candidate.stock.sector}\u0000${candidate.stock.subIndustry}`
    if ((groupCounts.get(groupKey) ?? 0) >= maximumPerSubIndustry) continue
    selected.push(candidate)
    groupCounts.set(groupKey, (groupCounts.get(groupKey) ?? 0) + 1)
    if (selected.length >= targetCount) break
  }

  const generatedAt = options.generatedAt ?? new Date().toISOString()
  return selected.map(({ stock, fundamentals, group, signals, dimensions }) => {
    const primary = signals[0]!
    const redFlags = [
      dimensions.find((dimension) => dimension.name === 'valuation')?.assessment === 'caution'
        ? `Valuation is elevated at ${formatMultiple(fundamentals.peRatio)} earnings.`
        : null,
      dimensions.find((dimension) => dimension.name === 'risk')?.assessment === 'caution'
        ? `Leverage is elevated at ${fundamentals.debtToEquity?.toFixed(2)} debt/equity.`
        : null,
      (stock.vs200DayAverage ?? 0) < 0 ? `Price remains ${formatPercent(stock.vs200DayAverage)} below the 200-day average.` : null,
    ].filter((item): item is string => Boolean(item))
    return {
      id: `candidate-${options.tradingDate}-${stock.symbol}`,
      symbol: stock.symbol,
      company: stock.company,
      sector: stock.sector,
      subIndustry: stock.subIndustry,
      tradingDate: options.tradingDate,
      whySurfaced: primary.summary,
      whatChanged: signals.map((signal) => signal.summary),
      industryContext: group
        ? `${stock.subIndustry} returned ${formatPercent(group.return30d)} over 30 days and ${formatPercent(group.return1y)} over one year.`
        : `${stock.subIndustry} context is still being established.`,
      decisiveNumbers: [
        { label: '30-day return', value: formatPercent(stock.return30d) },
        { label: 'vs 50-day average', value: formatPercent(stock.vs50DayAverage) },
        { label: 'Relative volume', value: finite(stock.relativeVolume) ? `${stock.relativeVolume.toFixed(1)}×` : 'Unavailable' },
        { label: 'Revenue growth', value: formatPercent(fundamentals.revenueGrowth) },
      ],
      valuationSnapshot: `${formatMultiple(fundamentals.peRatio)} P/E and ${formatMultiple(fundamentals.priceToSales)} price/sales; compare against its own history and direct peers in full research.`,
      dimensions,
      signals,
      evidence: [
        { label: 'Alpaca market history', url: 'https://alpaca.markets/data', asOf: stock.asOf },
        { label: 'FMP company fundamentals', url: fundamentals.profileUrl, asOf: fundamentals.fundamentalsAsOf },
      ],
      redFlags: redFlags.length > 0 ? redFlags : ['No decisive red flag surfaced in the lightweight screen; full research is still required.'],
      catalyst: fundamentals.nextEarningsDate
        ? `Earnings expected ${fundamentals.nextEarningsDate}.`
        : signals.find((signal) => signal.kind === 'earnings_or_estimate_catalyst')?.summary ?? 'Watch for the next estimate revision or company filing.',
      nextResearchQuestion: `Is ${stock.symbol}'s improvement durable enough to justify its valuation relative to ${stock.subIndustry} peers?`,
      status: 'new',
      generatedAt,
    }
  })
}
