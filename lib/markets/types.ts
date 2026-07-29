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
}

export type ScreenerPreset = 'momentum' | 'unusual-volume' | 'near-highs' | 'gap-movers'

export type ScreenerFilterField =
  | 'price'
  | 'dailyChange'
  | 'gap'
  | 'volume'
  | 'relativeVolume'
  | 'above50DayAverage'
  | 'fiftyTwoWeekPosition'
  | 'exchange'
  | 'tradable'

export type ScreenerFilterOperator = 'gt' | 'gte' | 'lt' | 'lte' | 'eq'

export interface ScreenerFilter {
  id: string
  field: ScreenerFilterField
  operator: ScreenerFilterOperator
  value: number | string | boolean
  label: string
}

export type ScreenerSortField =
  | 'symbol'
  | 'price'
  | 'dailyChange'
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

export interface ScreenerRow {
  symbol: string
  company: string
  price: number
  dailyChange: number
  gap: number
  volume: number
  relativeVolume: number
  range: number[]
  fiftyDayAverage: number
  fiftyTwoWeekPosition: number
  exchange: string
  tradable: boolean
  asOf: string
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
}
