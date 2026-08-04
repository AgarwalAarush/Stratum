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
  | 'market_thesis'
  | 'thesis_led'
  | 'dislocation'
  | 'fundamental_inflection'
  | 'leadership'

export interface MarketThesisCandidateLink {
  hypothesisId: string
  title: string
  version: number
  mechanism: string
  materiality: number
  role: 'beneficiary' | 'loser' | 'substitute'
  verificationStatus: 'verified' | 'needs_company_research' | 'unverified'
}

export interface CandidateTrackingContext {
  acceptedThesis: boolean
  watched: boolean
  owned: boolean
  marketTheses?: MarketThesisCandidateLink[]
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
  marketThesis?: MarketThesisCandidateLink | null
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
  /** Null when neither a materialized quote nor a persisted close is available. */
  price: number | null
  priceSource: 'market_snapshot' | 'daily_close' | 'unavailable'
  dailyChange: number | null
  return30d: number | null
  return1y: number | null
  relativeVolume: number | null
  fiftyDayAverage: number | null
  fiftyTwoWeekPosition: number | null
  dataAsOf: string
  feed: MarketFeed
  instrumentType: 'equity' | 'etf'
  leadership: StockLeadershipMetric | null
  candidate: CandidateBrief | null
  companyPacket: CompanyPacket | null
  researchNote: EquityResearchNote | null
  etfResearchNote: EtfResearchNote | null
  decision: ThesisDecision | null
  position: ManualPosition | null
  thesis: InvestmentThesis | null
  history: StockPricePoint[]
}

export interface EtfHolding {
  symbol: string | null
  name: string
  identifier: string | null
  classification: string | null
  shares: number | null
  marketValue: number | null
  weight: number
}

export interface EtfResearchPacket {
  id: string
  symbol: string
  version: number
  dataAsOf: string
  generatedAt: string
  issuer: string
  fundName: string
  benchmark: string | null
  strategy: string | null
  expenseRatio: number | null
  assetsUnderManagement: number | null
  rebalanceFrequency: string | null
  holdings: EtfHolding[]
  holdingsCount: number
  topTenWeight: number
  priceHistory: CompanyPacket['priceHistory']
  sources: CompanyPacketSource[]
}

export type EtfResearchSectionId =
  | 'fund_snapshot'
  | 'portfolio_exposure'
  | 'top_holdings'
  | 'index_and_rebalance'
  | 'fundamentals_look_through'
  | 'valuation_and_setup'
  | 'catalysts'
  | 'bull_case'
  | 'base_case'
  | 'bear_case'
  | 'risk_factors'
  | 'verdict'

export interface EtfResearchSection {
  id: EtfResearchSectionId
  title: string
  content: string
  sourceIds: string[]
}

export interface EtfResearchNote {
  id: string
  symbol: string
  version: number
  status: 'queued' | 'running' | 'complete' | 'failed'
  formalRating: EquityResearchNote['formalRating']
  entryAction: EquityResearchNote['entryAction']
  investmentThesis: string
  keyDebate: string
  fastestKillSignal: string
  confidence: number
  revision: EquityResearchRevision
  sections: EtfResearchSection[]
  sourceIds: string[]
  provider: string
  model: string
  dataAsOf: string
  generatedAt: string
  error: string | null
}

export interface CompanyPacketSource {
  id: string
  label: string
  url: string
  source: string
  asOf: string
}

/**
 * Research-only material collected before the analysis model runs. This is
 * deliberately distinct from market observations: it gives the model enough
 * company, product, market, and competitive context to explain the business
 * without turning unverified search results into market facts.
 */
export type CompanyResearchEvidenceKind =
  | 'company_strategy'
  | 'product_and_customer'
  | 'growth_driver'
  | 'ai_and_product'
  | 'market_and_competition'
  | 'market_environment'
  | 'strategic_relationship'
  | 'moat'

export type CompanyResearchEvidenceQuality = 'primary' | 'regulatory' | 'independent' | 'discovery'

export interface CompanyResearchEvidence {
  id: string
  kind: CompanyResearchEvidenceKind
  title: string
  url: string
  source: string
  publishedAt: string
  excerpt: string | null
  quality: CompanyResearchEvidenceQuality
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

export interface CompanyFinancialReconciliation {
  asOf: string
  cashAndCashEquivalents: number | null
  shortTermInvestments: number | null
  totalLiquidity: number | null
  grossDebt: number | null
  /** Positive is net cash; negative is net debt. */
  netCash: number | null
  operatingCashFlow: number | null
  capitalExpenditure: number | null
  providerFreeCashFlow: number | null
  calculatedFreeCashFlow: number | null
  liquiditySource: 'sec_edgar' | 'fmp'
  warnings: string[]
}

export interface CompanyPacket {
  id: string
  symbol: string
  version: number
  dataAsOf: string
  generatedAt: string
  priceHistory: {
    latestPrice: number | null
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
    balanceQuarterly: Array<Record<string, string | number | boolean | null>>
    cashFlowAnnual: Array<Record<string, string | number | boolean | null>>
    cashFlowQuarterly: Array<Record<string, string | number | boolean | null>>
  }
  financialReconciliation?: CompanyFinancialReconciliation | null
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
  filings: Array<{
    title: string
    url: string
    publishedAt: string
    form?: string
    excerpt?: string | null
  }>
  events: Array<{ title: string; url: string; publishedAt: string; category: string }>
  researchEvidence?: CompanyResearchEvidence[]
  /** Parent market models are context only; company research must independently verify exposure. */
  marketTheses?: Array<{
    hypothesisId: string
    title: string
    version: number
    state: MarketThesisState
    whyNow: string
    economics: string
    falsifiers: string[]
    exposure: MarketThesisCandidateLink
  }>
  industryContext: {
    sector: string
    subIndustry: string
    groupReturn30d: number | null
    groupReturn1y: number | null
  }
  existingThesis: ThesisDecision | null
  sources: CompanyPacketSource[]
}

export type CompanyMarketEvidenceStatus =
  | 'observed'
  | 'company_claim'
  | 'analyst_inference'
  | 'unverified'

export interface CompanyMarketBusinessLine {
  name: string
  offering: string
  customers: string
  jobToBeDone: string
  monetization: string
  maturity: 'proven' | 'scaling' | 'emerging' | 'optionality'
  evidenceStatus: CompanyMarketEvidenceStatus
  sourceIds: string[]
}

export interface CompanyMarketValueChainLayer {
  layer: string
  role: string
  companyPosition: string
  economics: string
  participants: string[]
  sourceIds: string[]
}

export interface CompanyMarketForce {
  name: string
  direction: 'tailwind' | 'headwind' | 'mixed'
  mechanism: string
  horizon: string
  evidenceStatus: CompanyMarketEvidenceStatus
  sourceIds: string[]
}

export interface CompanyMarketConstraint {
  name: string
  severity: 'binding' | 'important' | 'watch' | 'not_established'
  mechanism: string
  scarcityRentCapture: string
  resolutionSignals: string[]
  sourceIds: string[]
}

export interface CompanyMarketCausalLink {
  from: string
  to: string
  mechanism: string
  evidenceStatus: CompanyMarketEvidenceStatus
  sourceIds: string[]
}

export interface CompanyMarketCompetitor {
  name: string
  customerOverlap: string
  capability: string
  companyAdvantage: string
  companyGap: string
  implication: string
  sourceIds: string[]
}

export interface CompanyMarketStrategicRelationship {
  entity: string
  relationship: string
  status: 'verified' | 'company_claim' | 'analyst_inference' | 'unverified'
  economicMechanism: string
  thesisTreatment: string
  sourceIds: string[]
}

export interface CompanyMarketCrossCheck {
  method: string
  result: string
  implication: string
  sourceIds: string[]
}

export interface CompanyMarketPrediction {
  prediction: string
  horizon: string
  leadingIndicator: string
  confirmation: string
  disconfirmation: string
  sourceIds: string[]
}

export interface CompanyMarketFalsifier {
  condition: string
  observable: string
  thesisImpact: string
  sourceIds: string[]
}

export interface CompanyMarketModel {
  id: string
  symbol: string
  version: number
  status: 'running' | 'complete' | 'failed'
  businessSummary: string
  centralMarketQuestion: string
  marketThesis: string
  businessLines: CompanyMarketBusinessLine[]
  valueChain: CompanyMarketValueChainLayer[]
  demandDrivers: CompanyMarketForce[]
  supplyConstraints: CompanyMarketConstraint[]
  causalChain: CompanyMarketCausalLink[]
  marketStructure: {
    marketDefinition: string
    pricingPower: string
    scarcityRentCapture: string
    cyclicality: string
    regulationAndPolicy: string
  }
  competitors: CompanyMarketCompetitor[]
  strategicRelationships: CompanyMarketStrategicRelationship[]
  crossChecks: CompanyMarketCrossCheck[]
  expectations: {
    currentNarrative: string
    whatAppearsPriced: string
    variantView: string
    sourceIds: string[]
  }
  predictions: CompanyMarketPrediction[]
  falsifiers: CompanyMarketFalsifier[]
  financialRole: {
    fundingCapacity: string
    monetizationProof: string
    valuationConstraint: string
    sourceIds: string[]
  }
  evidenceGaps: string[]
  confidence: number
  sourceIds: string[]
  provider: string
  model: string
  dataAsOf: string
  generatedAt: string
  error: string | null
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
  companyMarketModelId?: string | null
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
  voidedAt: string | null
  voidReason: string | null
  replacedById: string | null
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

// World-memory artifacts intentionally sit above company research. They retain
// sourced market context even before there is a security-level conclusion.
export type WorldSourceTier = 'primary' | 'regulatory' | 'independent' | 'discovery'
export type WorldSourceStatus = 'candidate' | 'probation' | 'approved' | 'blocked' | 'retired'
export type WorldSourceKind = 'api' | 'rss' | 'html' | 'pdf' | 'dataset' | 'filing' | 'transcript'
export type WorldSourceEvidenceClass = 'regulatory_data' | 'company_disclosure' | 'operational_data' | 'technical_research' | 'industry_research' | 'market_expectations' | 'discovery'
export type WorldObservationKind = 'fact' | 'estimate' | 'claim' | 'inference'
export type WorldEntityKind = 'company' | 'technology' | 'facility' | 'commodity' | 'jurisdiction' | 'regulator' | 'industry' | 'dataset'
export type WorldRelationshipType = 'requires' | 'supplies' | 'constrains' | 'substitutes_for' | 'benefits_from' | 'operates'
export type MarketHypothesisStatus = 'dormant' | 'forming' | 'proposed' | 'active' | 'rejected' | 'archived'
export type MarketThesisState = 'active' | 'weakened' | 'invalidated' | 'archived'

export interface WorldDocument {
  id: string
  contentHash: string
  canonicalUrl: string
  title: string
  publisher: string
  sourceTier: WorldSourceTier
  mimeType: string
  archiveKey: string | null
  extractedKey: string | null
  extractionStatus: 'pending' | 'complete' | 'failed'
  publishedAt: string | null
  ingestedAt: string
  backupState: 'pending' | 'verified' | 'failed' | 'not_configured'
  metadata: Record<string, unknown>
}

/**
 * A source is governed independently from the documents it emits. Discovery is
 * deliberately not approval: only sources with an active contract may become
 * evidence for the market model.
 */
export interface WorldSourceRegistryEntry {
  id: string
  slug: string
  label: string
  publisher: string
  canonicalUrl: string
  sourceTier: WorldSourceTier
  sourceKind: WorldSourceKind
  status: WorldSourceStatus
  evidenceClasses: WorldSourceEvidenceClass[]
  discoveredBy: 'seed' | 'scout' | 'user'
  discoveryRunId: string | null
  approvedAt: string | null
  blockedReason: string | null
  createdAt: string
  updatedAt: string
}

export interface WorldSourceContract {
  id: string
  sourceId: string
  version: number
  status: 'draft' | 'active' | 'retired'
  allowedHosts: string[]
  allowedPaths: string[]
  acceptedMimeTypes: string[]
  cadence: 'event' | 'daily' | 'weekly' | 'monthly'
  assertionsAllowed: string[]
  retentionDays: number | null
  notes: string
  createdAt: string
}

export interface MarketDomainPack {
  id: string
  version: number
  label: string
  description: string
  status: 'candidate' | 'active' | 'archived'
  parentDomainId: string | null
  mechanisms: Array<{ id: string; label: string; required: boolean }>
  sourceRequirements: Array<{ evidenceClass: WorldSourceEvidenceClass; purpose: string; minimumSources: number }>
  entityKinds: WorldEntityKind[]
}

export interface WorldSourceScoutCandidate {
  slug: string
  label: string
  publisher: string
  canonicalUrl: string
  sourceTier: WorldSourceTier
  sourceKind: WorldSourceKind
  evidenceClasses: WorldSourceEvidenceClass[]
  domains: string[]
  coverage: string
  whyThisSource: string
  limitations: string[]
  candidateScore: number
}

export interface WorldSourceDiscoveryRun {
  id: string
  domainId: string
  status: 'running' | 'complete' | 'failed'
  trigger: 'bootstrap' | 'frontier_gap' | 'coverage_review' | 'manual'
  reason: string
  candidates: WorldSourceScoutCandidate[]
  provider: string | null
  model: string | null
  generatedAt: string | null
  error: string | null
  createdAt: string
}

export interface WorldSourceControlWorkspaceData {
  domains: MarketDomainPack[]
  sources: WorldSourceRegistryEntry[]
  discoveryRuns: WorldSourceDiscoveryRun[]
}

export interface WorldObservation {
  id: string
  documentId: string
  assertion: string
  kind: WorldObservationKind
  domain: string
  mechanism: string
  entityIds: string[]
  geography: string | null
  numericValue: number | null
  numericUnit: string | null
  validFrom: string | null
  validTo: string | null
  observedAt: string | null
  publishedAt: string | null
  ingestedAt: string
  confidence: number
  materiality: number
  novelty: number
  decayHours: number | null
  supersedesId: string | null
  source: Pick<WorldDocument, 'title' | 'canonicalUrl' | 'publisher' | 'sourceTier'>
}

export interface WorldBaseline {
  id: string
  scopeType: 'global' | 'domain' | 'industry' | 'entity'
  scopeKey: string
  version: number
  content: {
    state: string
    changes: string[]
    constraints: string[]
    openQuestions: string[]
    contradictions: string[]
    dormantSignals: string[]
    activeHypotheses: string[]
  }
  markdown: string
  observationIds: string[]
  sourceIds: string[]
  dataAsOf: string
  generatedAt: string
  diff: string[]
  freshness: 'fresh' | 'aging' | 'stale'
}

export interface MarketHypothesisEvidence {
  observationId: string
  role: 'supporting' | 'contradicting'
  causalNode: string
  weight: number
  explanation: string
}

export interface MarketHypothesis {
  id: string
  ownerId: string
  title: string
  status: MarketHypothesisStatus
  scope: string
  horizon: string
  coreMechanism: string
  causalGraph: Array<{ from: string; to: string; mechanism: string; core: boolean }>
  confidence: number
  unresolvedNodes: string[]
  counterThesis: string
  evidence: MarketHypothesisEvidence[]
  parentHypothesisId: string | null
  createdAt: string
  updatedAt: string
  latestResearch?: MarketHypothesisResearchVersion | null
}

export type MarketHypothesisResearchStatus = 'running' | 'complete' | 'needs_revision' | 'failed'
export type MarketResearchEvidenceStatus = 'observed' | 'estimate' | 'claim' | 'inference' | 'unverified'

export interface MarketHypothesisResearchContent {
  thesisStatement: string
  whyNow: string
  causalChain: Array<{ from: string; to: string; mechanism: string; evidenceStatus: MarketResearchEvidenceStatus; sourceIds: string[] }>
  demand: { currentState: string; changeMechanism: string; sourceIds: string[] }
  supply: { currentState: string; changeMechanism: string; sourceIds: string[] }
  bottlenecks: Array<{ name: string; mechanism: string; severity: 'binding' | 'important' | 'watch' | 'not_established'; whoCapturesEconomics: string; resolutionSignals: string[]; sourceIds: string[] }>
  economics: { valueChain: string; scarcityRentCapture: string; beneficiaries: string[]; substitutes: string[]; sourceIds: string[] }
  expectations: { currentNarrative: string; whatAppearsPriced: string; variantView: string; sourceIds: string[] }
  counterThesis: { statement: string; mechanisms: string[]; decisiveTests: string[]; sourceIds: string[] }
  predictions: Array<{ prediction: string; horizon: string; leadingIndicator: string; confirmation: string; disconfirmation: string; sourceIds: string[] }>
  falsifiers: Array<{ condition: string; observable: string; thesisImpact: string; sourceIds: string[] }>
  researchFrontier: Array<{ question: string; causalNode: string; priority: 1 | 2 | 3 | 4 | 5; sourceTypes: string[]; evidenceNeeded: string }>
  evidenceGaps: string[]
  confidence: number
  sourceIds: string[]
}

export interface MarketHypothesisCritique {
  verdict: 'pass' | 'needs_revision'
  summary: string
  unsupportedClaims: string[]
  contradictoryEvidence: string[]
  missingAlternatives: string[]
  requiredResearch: string[]
  confidenceAdjustment: number
  sourceIds: string[]
}

export interface MarketHypothesisResearchVersion {
  id: string
  hypothesisId: string
  version: number
  status: MarketHypothesisResearchStatus
  content: MarketHypothesisResearchContent | null
  critique: MarketHypothesisCritique | null
  sourceIds: string[]
  observationIds: string[]
  priorResearchVersionId: string | null
  revisionDiff: string[]
  provider: string | null
  model: string | null
  dataAsOf: string
  generatedAt: string | null
  error: string | null
}

export interface MarketResearchFrontierItem {
  id: string
  hypothesisId: string
  researchVersionId: string | null
  question: string
  causalNode: string
  priority: number
  sourceTypes: string[]
  adapterId: string | null
  status: 'queued' | 'complete' | 'blocked' | 'deferred'
  evidenceNeeded: string
  attemptCount: number
  lastError: string | null
  nextRunAt: string | null
}

export interface ThesisPrediction {
  id: string
  prediction: string
  expectedDirection: string
  deadline: string | null
  evidenceNeeded: string
  result: 'pending' | 'confirmed' | 'disconfirmed' | 'expired'
  evaluatedAt: string | null
}

export interface MarketThesisExposure {
  id: string
  valueChainLayer: string
  entityName: string
  symbol: string | null
  role: 'beneficiary' | 'loser' | 'substitute'
  mechanism: string
  materiality: number
  confidence: number
  verificationStatus: 'verified' | 'needs_company_research' | 'unverified'
}

export interface MarketThesisVersion {
  id: string
  hypothesisId: string
  version: number
  state: MarketThesisState
  title: string
  content: {
    whyNow: string
    economics: string
    expectations: string
    falsifiers: string[]
    counterThesis: string
    sourceLedger: Array<{ documentId: string; label: string; url: string; tier: WorldSourceTier }>
  }
  confidence: number
  dataAsOf: string
  generatedAt: string
  revisionDiff: string[]
  researchVersionId: string | null
  predictions: ThesisPrediction[]
  exposures: MarketThesisExposure[]
}

export interface MarketThesisWorkspaceData {
  baseline: WorldBaseline | null
  hypotheses: MarketHypothesis[]
  theses: MarketThesisVersion[]
}
