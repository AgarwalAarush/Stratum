import type {
  CandidateBrief,
  CandidateDimension,
  CandidateLane,
  CandidateSignal,
  CandidateTrackingContext,
  MarketGroupMetric,
  StockLeadershipMetric,
} from './types.ts'

export interface CandidateFundamentals {
  symbol: string
  company: string
  sector: string
  subIndustry: string
  marketCap: number | null
  peRatio: number | null
  forwardPe: number | null
  forwardEstimateDate: string | null
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
  lanes: CandidateLane[]
  tracking: CandidateTrackingContext
  attentionPriority: number
}

const EMPTY_TRACKING: CandidateTrackingContext = {
  acceptedThesis: false,
  watched: false,
  owned: false,
  marketTheses: [],
}

const LANE_ORDER: CandidateLane[] = [
  'market_thesis',
  'event_catalyst',
  'thesis_led',
  'dislocation',
  'fundamental_inflection',
  'leadership',
]

const LANE_TARGETS: Record<CandidateLane, number> = {
  market_thesis: 2,
  event_catalyst: 2,
  thesis_led: 2,
  dislocation: 3,
  fundamental_inflection: 2,
  leadership: 3,
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

function formatEarningsMultiple(value: number | null): string {
  return finite(value) && value > 0 ? `${value.toFixed(1)}×` : 'Not meaningful'
}

function selloffThreshold(
  stock: StockLeadershipMetric,
  tracking: CandidateTrackingContext,
): { triggered: boolean; summary: string; materialKey: string } {
  const tracked = tracking.acceptedThesis || tracking.watched || tracking.owned
  const thresholds = tracked
    ? { day: -1.5, fiveDay: -4, thirtyDay: -8 }
    : { day: -3, fiveDay: -7, thirtyDay: -12 }
  const moves = [
    finite(stock.dayReturn) && stock.dayReturn <= thresholds.day
      ? { period: 'one session', value: stock.dayReturn, key: '1d' }
      : null,
    finite(stock.return5d) && stock.return5d <= thresholds.fiveDay
      ? { period: 'five trading days', value: stock.return5d, key: '5d' }
      : null,
    finite(stock.return30d) && stock.return30d <= thresholds.thirtyDay
      ? { period: '30 days', value: stock.return30d, key: '30d' }
      : null,
  ].filter((move): move is { period: string; value: number; key: string } => move !== null)
  if (moves.length === 0) return { triggered: false, summary: '', materialKey: '' }
  const decisive = [...moves].sort((left, right) =>
    Math.abs(right.value) - Math.abs(left.value))[0]!
  return {
    triggered: true,
    summary: `${stock.symbol} fell ${Math.abs(decisive.value).toFixed(1)}% over ${decisive.period}; determine whether the move changed the business thesis or only the entry price.`,
    materialKey: `selloff:${decisive.key}:${Math.round(decisive.value / 2) * 2}`,
  }
}

function trackingLabel(tracking: CandidateTrackingContext): string {
  if (tracking.acceptedThesis) return 'an accepted thesis'
  if (tracking.owned) return 'an owned position'
  return 'a watchlist'
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
  tracking: CandidateTrackingContext,
): CandidateSignal[] {
  const signals: CandidateSignal[] = []
  if (finite(stock.dayReturn) && Math.abs(stock.dayReturn) >= 15) {
    signals.push({
      kind: 'extraordinary_price_move',
      summary: `${stock.symbol} moved ${stock.dayReturn >= 0 ? '+' : ''}${stock.dayReturn.toFixed(1)}% in one session; identify the event, test whether it changes long-run economics, and separate information from price reflexivity.`,
      materialKey: `extraordinary-move:${Math.round(stock.dayReturn / 5) * 5}`,
    })
  }
  const selloff = selloffThreshold(stock, tracking)
  if (selloff.triggered) {
    signals.push({
      kind: 'selloff_dislocation',
      summary: selloff.summary,
      materialKey: selloff.materialKey,
    })
  }
  if (selloff.triggered && (tracking.acceptedThesis || tracking.watched || tracking.owned)) {
    signals.push({
      kind: 'tracked_thesis_dislocation',
      summary: `${stock.symbol} is covered by ${trackingLabel(tracking)}, so price weakness triggers thesis review instead of removing the company from consideration.`,
      materialKey: `tracked:${tracking.acceptedThesis ? 'thesis' : tracking.owned ? 'owned' : 'watched'}`,
    })
  }
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
  if (
    selloff.triggered
    && (
      ((fundamentals.returnOnEquity ?? 0) >= 10 && (fundamentals.netMargin ?? 0) >= 5)
      || (fundamentals.revenueGrowth ?? 0) >= 5
      || (fundamentals.estimateGrowth ?? 0) >= 8
    )
  ) {
    signals.push({
      kind: 'fundamental_resilience',
      summary: `The lightweight fundamental screen remains constructive despite the selloff: ${formatPercent(fundamentals.revenueGrowth)} revenue growth and ${formatPercent(fundamentals.estimateGrowth)} estimate growth.`,
      materialKey: `resilience:${Math.round((fundamentals.estimateGrowth ?? fundamentals.revenueGrowth ?? 0) / 5) * 5}`,
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
      assessment: assessment(valuationValue, (v) => v > 0 && v <= 20, (v) => v > 0 && v <= 30, (v) => v <= 0 || v > 45),
      evidence: `${formatEarningsMultiple(fundamentals.peRatio)} trailing · ${formatEarningsMultiple(fundamentals.forwardPe)} next FY`,
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

function candidateLanes(
  stock: StockLeadershipMetric,
  fundamentals: CandidateFundamentals,
  signals: CandidateSignal[],
  dimensions: CandidateDimension[],
  tracking: CandidateTrackingContext,
  minimumHistory: number,
): CandidateLane[] {
  const hasSelloff = signals.some((signal) => signal.kind === 'selloff_dislocation')
  const tracked = tracking.acceptedThesis || tracking.watched || tracking.owned
  const leadershipSignals = signals.filter((signal) => [
    'leadership_transition',
    'company_group_divergence',
    'price_volume_confirmation',
  ].includes(signal.kind))
  const ownershipSupport = dimensions.filter((dimension) =>
    ['business_quality', 'growth', 'valuation'].includes(dimension.name)
    && (dimension.assessment === 'strong' || dimension.assessment === 'positive')).length
  const risk = dimensions.find((dimension) => dimension.name === 'risk')?.assessment
  const estimateInflection = (fundamentals.estimateGrowth ?? fundamentals.earningsGrowth ?? 0) >= 10
    && (fundamentals.revenueGrowth ?? 0) >= 0
  const lanes: CandidateLane[] = []
  if ((tracking.marketTheses?.length ?? 0) > 0 && signals.length > 0) lanes.push('market_thesis')
  if (signals.some((signal) => signal.kind === 'extraordinary_price_move')) lanes.push('event_catalyst')
  if (tracked && hasSelloff) lanes.push('thesis_led')
  if (hasSelloff && ownershipSupport >= 2 && risk !== 'caution') lanes.push('dislocation')
  if (hasSelloff && estimateInflection) lanes.push('fundamental_inflection')
  if (stock.observationCount >= minimumHistory && leadershipSignals.length >= 2) lanes.push('leadership')
  return lanes
}

function priority(
  stock: StockLeadershipMetric,
  dimensions: CandidateDimension[],
  signals: CandidateSignal[],
  lanes: CandidateLane[],
  tracking: CandidateTrackingContext,
): number {
  const dimensionValue = { strong: 3, positive: 2, mixed: 1, caution: 0 }
  const laneBonus = lanes.reduce((sum, lane) => sum + ({
    market_thesis: 7,
    event_catalyst: 9,
    thesis_led: 8,
    dislocation: 6,
    fundamental_inflection: 4,
    leadership: 2,
  })[lane], 0)
  const selloffUrgency = Math.max(
    Math.abs(Math.min(stock.dayReturn ?? 0, 0)),
    Math.abs(Math.min(stock.return5d ?? 0, 0)) / 2,
    Math.abs(Math.min(stock.return30d ?? 0, 0)) / 4,
  )
  return dimensions.reduce((sum, dimension) => sum + dimensionValue[dimension.assessment], 0)
    + signals.length * 2
    + laneBonus
    + Math.min(8, selloffUrgency)
    + (tracking.acceptedThesis ? 5 : 0)
}

export function rankCandidateUniverse(
  stocks: StockLeadershipMetric[],
  groups: MarketGroupMetric[],
  fundamentals: CandidateFundamentals[],
  minimumHistory = 200,
  trackingBySymbol: ReadonlyMap<string, CandidateTrackingContext> = new Map(),
): RankedCandidate[] {
  const groupByKey = new Map(groups.map((group) => [`${group.sector}\u0000${group.label}`, group]))
  const fundamentalsBySymbol = new Map(fundamentals.map((item) => [item.symbol, item]))
  return stocks.flatMap((stock) => {
    const companyFundamentals = fundamentalsBySymbol.get(stock.symbol)
    if (!companyFundamentals) return []
    const group = groupByKey.get(`${stock.sector}\u0000${stock.subIndustry}`) ?? null
    const tracking = trackingBySymbol.get(stock.symbol) ?? EMPTY_TRACKING
    const signals = candidateSignals(stock, group, companyFundamentals, tracking)
    const dimensions = candidateDimensions(stock, companyFundamentals)
    const lanes = candidateLanes(stock, companyFundamentals, signals, dimensions, tracking, minimumHistory)
    if (lanes.length === 0) return []
    return [{
      stock,
      fundamentals: companyFundamentals,
      group,
      signals,
      dimensions,
      lanes,
      tracking,
      attentionPriority: priority(stock, dimensions, signals, lanes, tracking),
    }]
  }).sort((left, right) =>
    right.attentionPriority - left.attentionPriority
    || (right.stock.return30d ?? -Infinity) - (left.stock.return30d ?? -Infinity)
    || left.stock.symbol.localeCompare(right.stock.symbol))
}

export function selectCandidateBriefs(
  ranked: RankedCandidate[],
  options: CandidateScoutOptions,
): CandidateBrief[] {
  const targetCount = options.targetCount ?? 8
  const maximumPerSubIndustry = options.maximumPerSubIndustry ?? 2
  const suppressionTradingDays = options.suppressionTradingDays ?? 5
  const history = options.history ?? []
  const groupCounts = new Map<string, number>()
  const selected: RankedCandidate[] = []
  const selectedSymbols = new Set<string>()
  const suppressedSymbols = new Set<string>()
  const canSelect = (candidate: RankedCandidate): boolean => {
    if (selectedSymbols.has(candidate.stock.symbol) || suppressedSymbols.has(candidate.stock.symbol)) return false
    const prior = history
      .filter((item) => item.symbol === candidate.stock.symbol)
      .sort((left, right) => right.tradingDate.localeCompare(left.tradingDate))[0]
    const currentKeys = candidate.signals.map((signal) => signal.materialKey)
    const repeated = prior
      && tradingDateDistance(prior.tradingDate, options.tradingDate) < suppressionTradingDays
      && currentKeys.every((key) => prior.materialKeys.includes(key))
    if (repeated) {
      suppressedSymbols.add(candidate.stock.symbol)
      return false
    }
    const classified = candidate.stock.subIndustry !== 'Unknown'
      && candidate.stock.subIndustry !== 'Classification pending'
    const groupKey = classified
      ? `${candidate.stock.sector}\u0000${candidate.stock.subIndustry}`
      : `symbol\u0000${candidate.stock.symbol}`
    if ((groupCounts.get(groupKey) ?? 0) >= maximumPerSubIndustry) return false
    selected.push(candidate)
    selectedSymbols.add(candidate.stock.symbol)
    groupCounts.set(groupKey, (groupCounts.get(groupKey) ?? 0) + 1)
    return true
  }

  for (const lane of LANE_ORDER) {
    let laneCount = 0
    for (const candidate of ranked) {
      if (!candidate.lanes.includes(lane)) continue
      if (canSelect(candidate)) laneCount += 1
      if (laneCount >= LANE_TARGETS[lane] || selected.length >= targetCount) break
    }
    if (selected.length >= targetCount) break
  }
  for (const candidate of ranked) {
    if (selected.length >= targetCount) break
    canSelect(candidate)
  }

  const generatedAt = options.generatedAt ?? new Date().toISOString()
  return selected.map(({ stock, fundamentals, group, signals, dimensions, lanes, tracking }) => {
    const primaryLane = LANE_ORDER.find((lane) => lanes.includes(lane)) ?? lanes[0]!
    const primaryKinds: Record<CandidateLane, CandidateSignal['kind'][]> = {
      market_thesis: ['leadership_transition', 'company_group_divergence', 'price_volume_confirmation', 'selloff_dislocation', 'fundamental_resilience'],
      event_catalyst: ['extraordinary_price_move'],
      thesis_led: ['tracked_thesis_dislocation'],
      dislocation: ['selloff_dislocation', 'fundamental_resilience'],
      fundamental_inflection: ['fundamental_resilience', 'earnings_or_estimate_catalyst'],
      leadership: ['leadership_transition', 'company_group_divergence', 'price_volume_confirmation'],
    }
    const primary = signals.find((signal) => primaryKinds[primaryLane].includes(signal.kind)) ?? signals[0]!
    const redFlags = [
      dimensions.find((dimension) => dimension.name === 'valuation')?.assessment === 'caution'
        ? fundamentals.peRatio !== null && fundamentals.peRatio <= 0
          ? 'Trailing earnings are negative, so P/E is not meaningful.'
          : `Valuation is elevated at ${formatEarningsMultiple(fundamentals.peRatio)} earnings.`
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
      primaryLane,
      lanes,
      tracking,
      marketThesis: tracking.marketTheses?.sort((left, right) => right.materiality - left.materiality)[0] ?? null,
      selloff: {
        day: stock.dayReturn,
        fiveDay: stock.return5d,
        thirtyDay: stock.return30d,
      },
      entryContext: ({
        market_thesis: 'Validate whether this company captures the parent market thesis through a material, defensible value-chain role before treating the exposure as investable.',
        event_catalyst: 'Identify the event behind the move, verify it against primary evidence, and determine whether expectations moved more than the company’s long-run economics.',
        thesis_led: 'Review whether the selloff changed the accepted or user-tracked thesis; if not, reassess the entry zone.',
        dislocation: 'Test whether recent weakness is fundamentals-driven or an overreaction before considering an entry.',
        fundamental_inflection: 'Verify that improving estimates or operating evidence can outlast the current price weakness.',
        leadership: 'Establish ownership quality and valuation before treating technical leadership as an entry.',
      })[primaryLane],
      whySurfaced: primaryLane === 'market_thesis' && tracking.marketTheses?.[0]
        ? `${tracking.marketTheses[0].title}: ${primary.summary}`
        : primary.summary,
      whatChanged: [
        ...(primaryLane === 'market_thesis' && tracking.marketTheses?.[0]
          ? [`Market thesis linkage: ${tracking.marketTheses[0].mechanism} (${tracking.marketTheses[0].role}; ${tracking.marketTheses[0].verificationStatus}).`]
          : []),
        ...signals.map((signal) => signal.summary),
      ],
      industryContext: group
        ? `${stock.subIndustry} returned ${formatPercent(group.return30d)} over 30 days and ${formatPercent(group.return1y)} over one year.`
        : `${stock.subIndustry} context is still being established.`,
      decisiveNumbers: [
        { label: '1-day return', value: formatPercent(stock.dayReturn) },
        { label: '5-day return', value: formatPercent(stock.return5d) },
        { label: '30-day return', value: formatPercent(stock.return30d) },
        { label: 'vs 50-day average', value: formatPercent(stock.vs50DayAverage) },
        { label: 'Relative volume', value: finite(stock.relativeVolume) ? `${stock.relativeVolume.toFixed(1)}×` : 'Unavailable' },
        { label: 'Revenue growth', value: formatPercent(fundamentals.revenueGrowth) },
        { label: 'Next FY P/E', value: formatEarningsMultiple(fundamentals.forwardPe) },
      ],
      forwardPe: fundamentals.forwardPe,
      forwardEstimateDate: fundamentals.forwardEstimateDate,
      valuationSnapshot: `${formatEarningsMultiple(fundamentals.peRatio)} trailing P/E, ${formatEarningsMultiple(fundamentals.forwardPe)} next-fiscal-year P/E, and ${formatMultiple(fundamentals.priceToSales)} price/sales; compare against its own history and direct peers in full research.`,
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
      nextResearchQuestion: primaryLane === 'market_thesis' && tracking.marketTheses?.[0]
        ? `Does ${stock.symbol} materially capture ${tracking.marketTheses[0].title}, or will substitutes and competitors capture more of the economics?`
        : primaryLane === 'event_catalyst'
        ? `What new evidence caused ${stock.symbol}'s move, and how much does it change approval, adoption, earnings, or platform value after accounting for what the price now implies?`
        : primaryLane === 'leadership'
        ? `Is ${stock.symbol}'s improvement durable enough to justify its valuation relative to ${stock.subIndustry} peers?`
        : `Did the selloff change ${stock.symbol}'s 1–2 year ownership case, or did it only improve the entry price?`,
      status: 'new',
      generatedAt,
    }
  })
}
