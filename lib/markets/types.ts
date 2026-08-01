export type MarketFeed = 'illustrative' | 'delayed_sip' | 'iex' | 'sip'
export type MarketDataStatus = 'real_time' | 'delayed' | 'end_of_day'
export type CrossAssetInstrumentType =
  | 'equity_index'
  | 'volatility_index'
  | 'treasury_yield'
  | 'currency_index'
  | 'commodity'
  | 'crypto'

export interface MarketAsset {
  symbol: string
  name: string
  exchange: string
  assetClass: 'us_equity'
  tradable: boolean
  active: boolean
}

export interface MarketSnapshot {
  symbol: string
  price: number
  previousClose: number
  open: number
  high: number
  low: number
  volume: number
  asOf: string
  feed: MarketFeed
}

export interface MarketDailyBar {
  symbol: string
  tradingDate: string
  open: number
  high: number
  low: number
  close: number
  volume: number
  tradeCount: number | null
  vwap: number | null
  feed: MarketFeed
  asOf: string
}

export interface ScreenerSnapshotMeta {
  id: string
  feed: MarketFeed
  status: 'building' | 'complete' | 'failed'
  dataAsOf: string
  rowCount: number
  publishedAt: string | null
}

export interface MarketInstrument {
  id: string
  symbol: string
  label: string
  value: string
  change: string
  direction: 'up' | 'down' | 'flat'
  instrumentType: CrossAssetInstrumentType
  source: 'fmp' | 'fred' | 'illustrative'
  sourceLabel: string
  sourceUrl: string
  feedTimestamp: string
  retrievedAt: string
  dataStatus: MarketDataStatus
  unit: 'index_points' | 'percent' | 'usd'
}

export interface CrossAssetObservation {
  id: string
  symbol: string
  label: string
  instrumentType: CrossAssetInstrumentType
  value: number
  previousValue: number | null
  changePercent: number | null
  unit: MarketInstrument['unit']
  source: 'fmp' | 'fred'
  sourceLabel: string
  sourceUrl: string
  feedTimestamp: string
  retrievedAt: string
  dataStatus: MarketDataStatus
}

export interface CrossAssetSnapshot {
  id: string
  status: 'building' | 'complete' | 'failed'
  observations: CrossAssetObservation[]
  dataAsOf: string
  retrievedAt: string
  publishedAt: string | null
}

export interface MarketEvidence {
  id: string
  source: string
  publishedAt: string
  url: string
}

export interface MarketState {
  regime: string
  confidence: number
  dataAsOf: string
}

export interface MarketMemoChange {
  id: string
  body: string
  source: string
  sourceTime: string
}

export interface MarketMemo {
  changes: MarketMemoChange[]
  sectorImplications: Array<{ direction: 'up' | 'down'; text: string }>
  catalysts: string[]
  risks: string[]
  watchItems: string[]
  generatedAt: string
}

export interface MarketOverviewResponse {
  state: MarketState
  memo: MarketMemo
  instruments: MarketInstrument[]
  evidence: MarketEvidence[]
  feed: MarketFeed
  dataAsOf: string
  generatedAt: string
  stale: boolean
  leadership?: MarketLeadershipSnapshot
  candidates?: CandidateBrief[]
  candidateWeeklySummary?: CandidateWeeklySummary
}

export interface StockLeadershipMetric {
  symbol: string
  company: string
  sector: string
  subIndustry: string
  price: number
  dayReturn: number | null
  return5d: number | null
  return30d: number | null
  return50d: number | null
  return200d: number | null
  return1y: number | null
  vs50DayAverage: number | null
  vs200DayAverage: number | null
  relativeVolume: number | null
  observationCount: number
  asOf: string
}

export interface MarketGroupMetric {
  groupType: 'sector' | 'sub_industry'
  label: string
  sector: string | null
  constituentCount: number
  dayReturn: number | null
  return5d: number | null
  return30d: number | null
  return50d: number | null
  return200d: number | null
  return1y: number | null
  vs50DayAverage: number | null
  vs200DayAverage: number | null
}

export interface MarketDivergenceSignal {
  id: string
  scope: 'stock_vs_group' | 'near_vs_long_term'
  symbol: string | null
  groupLabel: string
  nearTermReturn: number
  longTermReturn: number
  spread: number
  summary: string
}

export interface MarketLeadershipSnapshot {
  id: string
  tradingDate: string
  dataAsOf: string
  generatedAt: string
  universeCount: number
  usableCount: number
  freshCount: number
  advancingPercent: number
  above50DayPercent: number
  sectors: MarketGroupMetric[]
  subIndustries: MarketGroupMetric[]
  stocks: StockLeadershipMetric[]
  leaders: StockLeadershipMetric[]
  laggards: StockLeadershipMetric[]
  divergences: MarketDivergenceSignal[]
}

export type CandidateDimensionName =
  | 'business_quality'
  | 'growth'
  | 'valuation'
  | 'price_setup'
  | 'catalyst'
  | 'risk'

export interface CandidateDimension {
  name: CandidateDimensionName
  label: string
  assessment: 'strong' | 'positive' | 'mixed' | 'caution'
  evidence: string
}

export interface CandidateSignal {
  kind:
    | 'leadership_transition'
    | 'company_group_divergence'
    | 'price_volume_confirmation'
    | 'selloff_dislocation'
    | 'tracked_thesis_dislocation'
    | 'fundamental_resilience'
    | 'relative_valuation'
    | 'earnings_or_estimate_catalyst'
    | 'quality_improvement'
  summary: string
  materialKey: string
}

export type CandidateLane =
  | 'thesis_led'
  | 'dislocation'
  | 'fundamental_inflection'
  | 'leadership'

export interface CandidateTrackingContext {
  acceptedThesis: boolean
  watched: boolean
  owned: boolean
}

export interface CandidateBrief {
  id: string
  symbol: string
  company: string
  sector: string
  subIndustry: string
  tradingDate: string
  primaryLane: CandidateLane
  lanes: CandidateLane[]
  tracking: CandidateTrackingContext
  selloff: {
    day: number | null
    fiveDay: number | null
    thirtyDay: number | null
  }
  entryContext: string
  whySurfaced: string
  whatChanged: string[]
  industryContext: string
  decisiveNumbers: Array<{ label: string; value: string }>
  forwardPe?: number | null
  forwardEstimateDate?: string | null
  valuationSnapshot: string
  dimensions: CandidateDimension[]
  signals: CandidateSignal[]
  evidence: Array<{ label: string; url: string; asOf: string }>
  redFlags: string[]
  catalyst: string
  nextResearchQuestion: string
  status: 'new' | 'dismissed' | 'snoozed' | 'watchlisted' | 'promoted'
  generatedAt: string
}

export interface CandidateWeeklySummary {
  weekEnding: string
  periodStart: string
  generatedAt: string
  candidateCount: number
  uniqueSymbolCount: number
  statusCounts: Record<CandidateBrief['status'], number>
  leadingSubIndustries: Array<{
    label: string
    sector: string
    candidateCount: number
  }>
  highlights: Array<{
    symbol: string
    company: string
    subIndustry: string
    whySurfaced: string
    status: CandidateBrief['status']
  }>
}

export type ThesisEntityType = 'stock' | 'sub_industry'
export type ThesisStatus = 'proposed' | 'accepted' | 'rejected' | 'superseded'

export interface ThesisSource {
  label: string
  url: string
  asOf: string
}

export interface ThesisContent {
  headline: string
  summary: string
  coreBelief: string
  keyDebate: string
  whatChanged: string
  catalysts: string[]
  invalidation: string[]
  fastestKillSignal: string
  confidence: number
}

export interface ThesisIntakeDraft {
  entityType: ThesisEntityType
  symbol?: string
  sector?: string
  subIndustry?: string
  statement: string
  mispricing?: string
  keyDebate?: string
  fastestKillSignal?: string
}

export interface InvestmentThesis {
  id: string
  entityType: ThesisEntityType
  entityKey: string
  symbol: string | null
  sector: string | null
  subIndustry: string | null
  version: number
  status: ThesisStatus
  trigger: string
  content: ThesisContent
  sources: ThesisSource[]
  dataAsOf: string
  generatedAt: string
  reviewedAt: string | null
  researchNoteId: string | null
}

export type ThesisMonitorStatus = 'active' | 'paused'
export type ThesisMonitorOutcome = 'pending' | 'no_change' | 'attention' | 'refresh_queued' | 'failed'
export type ThesisMonitorCoverage = 'price' | 'material_events' | 'research' | 'leadership' | 'candidate_scout'

export interface ThesisMonitor {
  id: string
  thesisId: string
  entityKey: string
  status: ThesisMonitorStatus
  coverage: ThesisMonitorCoverage[]
  lastCheckedAt: string | null
  lastEvidenceAt: string | null
  lastOutcome: ThesisMonitorOutcome
  failureCount: number
  lastError: string | null
  updatedAt: string
}

export interface ThesisWorkspaceData {
  proposals: InvestmentThesis[]
  accepted: InvestmentThesis[]
  monitors: ThesisMonitor[]
}

export interface StockPricePoint {
  tradingDate: string
  close: number
  volume: number
}

export interface StockViewerData {
  symbol: string
  company: string
  exchange: string
  sector: string
  subIndustry: string
  price: number
  dailyChange: number | null
  return30d: number | null
  return1y: number | null
  relativeVolume: number | null
  fiftyDayAverage: number | null
  fiftyTwoWeekPosition: number | null
  dataAsOf: string
  feed: MarketFeed
  leadership: StockLeadershipMetric | null
  candidate: CandidateBrief | null
  companyPacket: CompanyPacket | null
  researchNote: EquityResearchNote | null
  decision: ThesisDecision | null
  position: ManualPosition | null
  thesis: InvestmentThesis | null
  history: StockPricePoint[]
}

export interface CompanyPacketSource {
  id: string
  label: string
  url: string
  source: string
  asOf: string
}

export interface CompanyTranscript {
  year: number
  quarter: number
  date: string
  content: string
  sourceId: string
}

export interface CompanySegmentValue {
  label: string
  revenue: number
}

export interface CompanySegmentPeriod {
  date: string
  fiscalYear: string | null
  period: string | null
  reportedCurrency: string | null
  values: CompanySegmentValue[]
}

export interface CompanyPacket {
  id: string
  symbol: string
  version: number
  dataAsOf: string
  generatedAt: string
  priceHistory: {
    latestPrice: number
    return30d: number | null
    return1y: number | null
    vs50DayAverage: number | null
    vs200DayAverage: number | null
  }
  company: Record<string, string | number | boolean | null>
  fundamentals: Array<Record<string, string | number | boolean | null>>
  financialStatements?: {
    incomeAnnual: Array<Record<string, string | number | boolean | null>>
    incomeQuarterly: Array<Record<string, string | number | boolean | null>>
    balanceAnnual: Array<Record<string, string | number | boolean | null>>
    cashFlowAnnual: Array<Record<string, string | number | boolean | null>>
    cashFlowQuarterly: Array<Record<string, string | number | boolean | null>>
  }
  ratios: Record<string, number | null>
  forwardEstimate?: {
    date: string
    eps: number
    forwardPe: number | null
  } | null
  sentiment?: {
    gradesConsensus: Record<string, string | number | boolean | null>
    keyMetrics: Record<string, string | number | boolean | null>
  }
  segmentRevenue?: {
    product: CompanySegmentPeriod[]
    geographic: CompanySegmentPeriod[]
  }
  estimates: Array<Record<string, string | number | null>>
  transcripts?: CompanyTranscript[]
  peers: string[]
  filings: Array<{ title: string; url: string; publishedAt: string }>
  events: Array<{ title: string; url: string; publishedAt: string; category: string }>
  industryContext: {
    sector: string
    subIndustry: string
    groupReturn30d: number | null
    groupReturn1y: number | null
  }
  existingThesis: ThesisDecision | null
  sources: CompanyPacketSource[]
}

export type EquityResearchSectionId =
  | 'snapshot'
  | 'business_model_and_moat'
  | 'financial_profile'
  | 'market_and_competition'
  | 'growth_drivers'
  | 'management_and_capital_allocation'
  | 'valuation'
  | 'catalysts'
  | 'bull_case'
  | 'base_case'
  | 'bear_case'
  | 'risk_factors'
  | 'sentiment_and_positioning'
  | 'verdict'
  | 'kill_criteria'

export interface EquityResearchSection {
  id: EquityResearchSectionId
  title: string
  content: string
  sourceIds: string[]
}

export type EquityResearchOpinionChange =
  | 'initial'
  | 'more_constructive'
  | 'less_constructive'
  | 'unchanged'

export interface EquityResearchRevisionChange {
  field: 'formal_rating' | 'entry_action' | 'fair_value' | 'investment_thesis' | 'key_debate' | 'kill_criteria' | 'evidence'
  previous: string
  current: string
  explanation: string
}

export interface EquityResearchRevision {
  priorVersion: number | null
  opinionChange: EquityResearchOpinionChange
  summary: string
  changes: EquityResearchRevisionChange[]
}

export interface EquityResearchNote {
  id: string
  symbol: string
  version: number
  status: 'queued' | 'running' | 'complete' | 'failed'
  formalRating: 'BUY' | 'HOLD' | 'SELL' | 'NOT_RATED'
  entryAction: 'buy_now' | 'nibble' | 'wait' | 'add_on_weakness' | 'avoid'
  investmentThesis: string
  keyDebate: string
  mispricing: string
  fastestKillSignal: string
  fairValue: number | null
  entryZoneLow: number | null
  entryZoneHigh: number | null
  confidence: number
  revision: EquityResearchRevision
  sections: EquityResearchSection[]
  sourceIds: string[]
  provider: string
  model: string
  dataAsOf: string
  generatedAt: string
  error: string | null
}

export interface ResearchJobStatus {
  id: string
  symbol: string
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  progress: number
  phase: string
  error: string | null
  createdAt: string
  updatedAt: string
}

export interface ThesisKillCriterion {
  id: string
  description: string
  metric?: 'price' | 'revenue_growth' | 'estimate_growth'
  operator?: 'lt' | 'gt'
  value?: number
}

export interface ThesisDecision {
  id: string
  symbol: string
  version: number
  disposition: 'own' | 'watch' | 'avoid'
  formalRating: 'BUY' | 'HOLD' | 'SELL' | 'NOT_RATED'
  entryAction: 'buy_now' | 'nibble' | 'wait' | 'add_on_weakness' | 'avoid'
  fairValue: number | null
  entryZoneLow: number | null
  entryZoneHigh: number | null
  conviction: number | null
  nextCatalyst: string | null
  killCriteria: ThesisKillCriterion[]
  rationale: string
  priceAtDecision: number | null
  createdAt: string
}

export interface DecisionReview {
  id: string
  decisionId: string
  symbol: string
  outcome: 'working' | 'not_working' | 'invalidated' | 'closed'
  expectationAssessment: string
  lessons: string
  postmortem: string
  reviewedAt: string
}

export interface ManualPosition {
  id: string
  symbol: string
  shares: number
  costBasisPerShare: number
  openedAt: string | null
  notes: string
  updatedAt: string
}

export type PortfolioTransactionAction = 'cash_deposit' | 'cash_withdrawal' | 'buy' | 'sell' | 'position_import'

export interface PortfolioAccount {
  id: string
  name: string
  kind: 'brokerage' | 'manual'
  initialFunds: number
  startedAt: string
  createdAt: string
}

export interface PortfolioTransaction {
  id: string
  portfolioId: string
  action: PortfolioTransactionAction
  symbol: string | null
  quantity: number | null
  pricePerShare: number | null
  fees: number
  occurredAt: string
  notes: string
  source: 'manual' | 'natural_language' | 'import'
  createdAt: string
}

export interface PortfolioHolding {
  symbol: string
  quantity: number
  costBasisPerShare: number
  totalCost: number
  currentPrice: number | null
  currentValue: number | null
  unrealizedPnl: number | null
}

export interface PortfolioAccountSummary {
  account: PortfolioAccount
  cashBalance: number
  investedCost: number
  marketValue: number | null
  totalValue: number | null
  unrealizedPnl: number | null
  holdings: PortfolioHolding[]
  dataSource: 'ledger' | 'robinhood'
  dataAsOf: string | null
}

export interface DecisionInboxItem {
  id: string
  portfolioId: string | null
  type: 'new_candidate' | 'thesis_refresh' | 'entry_zone_arrival' | 'catalyst' | 'kill_criterion_breach'
  symbol: string | null
  title: string
  summary: string
  evidence: Array<{ label: string; url: string; asOf: string }>
  investmentThesisId: string | null
  thesisMonitorId: string | null
  entityKey: string | null
  severity: 'information' | 'attention' | 'urgent'
  status: 'open' | 'dismissed' | 'resolved'
  dedupeKey: string
  occurredAt: string
  createdAt: string
}

export interface PortfolioWorkspaceData {
  watchlists: import('./watchlists.ts').MarketWatchlistState
  watchlistsPersisted: boolean
  positions: ManualPosition[]
  decisions: ThesisDecision[]
  decisionHistory: ThesisDecision[]
  reviews: DecisionReview[]
  inbox: DecisionInboxItem[]
  portfolios: PortfolioAccountSummary[]
  portfolioTransactions: PortfolioTransaction[]
}

export type ScreenerPreset = 'momentum' | 'unusual-volume' | 'near-highs' | 'gap-movers'

export const SCREENER_RETURN_FIELDS = [
  'dailyChange',
  'return5d',
  'return30d',
  'return90d',
  'return180d',
  'returnYtd',
  'return1y',
] as const

export type ScreenerReturnField = typeof SCREENER_RETURN_FIELDS[number]

export type ScreenerFilterField =
  | ScreenerReturnField
  | 'price'
  | 'gap'
  | 'volume'
  | 'relativeVolume'
  | 'above50DayAverage'
  | 'fiftyTwoWeekPosition'
  | 'exchange'
  | 'sector'
  | 'subIndustry'
  | 'tradable'

export type ScreenerFilterOperator = 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'in' | 'notIn'

export interface ScreenerFilter {
  id: string
  field: ScreenerFilterField
  operator: ScreenerFilterOperator
  value: number | string | string[] | boolean
  label: string
}

export type ScreenerSortField =
  | 'symbol'
  | 'price'
  | ScreenerReturnField
  | 'gap'
  | 'volume'
  | 'relativeVolume'
  | 'fiftyDayAverage'
  | 'fiftyTwoWeekPosition'

export interface ScreenerQuery {
  preset: ScreenerPreset
  filters: ScreenerFilter[]
  sort: ScreenerSortField
  direction: 'asc' | 'desc'
  page: number
  pageSize: number
}

export type SavedScreenerQuery = Pick<ScreenerQuery, 'preset' | 'filters' | 'sort' | 'direction'>

export interface SavedScreenerScreen {
  id: string
  name: string
  query: SavedScreenerQuery
  createdAt: string
  updatedAt: string
}

export interface ScreenerRow {
  symbol: string
  company: string
  price: number
  dailyChange: number
  return5d: number | null
  return30d: number | null
  return90d: number | null
  return180d: number | null
  returnYtd: number | null
  return1y: number | null
  gap: number
  volume: number
  relativeVolume: number
  range: number[]
  fiftyDayAverage: number
  fiftyTwoWeekPosition: number
  exchange: string
  sector: string
  subIndustry: string
  tradable: boolean
  asOf: string
}

export interface ScreenerTaxonomy {
  sectors: string[]
  subIndustries: string[]
}

export interface ScreenerResponse {
  rows: ScreenerRow[]
  total: number
  page: number
  pageSize: number
  feed: MarketFeed
  dataAsOf: string
  snapshotId: string
  stale: boolean
  taxonomy: ScreenerTaxonomy
}
