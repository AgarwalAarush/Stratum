import { DEFAULT_SCREENER_QUERY } from './screener.ts'
import type { MarketLeadershipSnapshot, ScreenerQuery, ScreenerResponse } from './types.ts'
import type { MarketWatchlistState } from './watchlists.ts'

export type ExploreView = 'stocks' | 'sectors' | 'sub-industries' | 'watchlists'
export type ExploreLeadership = Pick<MarketLeadershipSnapshot, 'tradingDate' | 'dataAsOf' | 'universeCount' | 'usableCount' | 'sectors' | 'subIndustries'> & {
  stocks: Array<Pick<MarketLeadershipSnapshot['stocks'][number], 'symbol' | 'sector' | 'subIndustry' | 'return30d' | 'asOf'>>
}
export type ExploreData =
  | { view: 'stocks'; screener: ScreenerResponse; query: ScreenerQuery }
  | { view: 'sectors' | 'sub-industries'; leadership: ExploreLeadership | null }
  | { view: 'watchlists'; universe: ScreenerResponse; watchlists: MarketWatchlistState; persisted: boolean }

export function exploreView(value: unknown): ExploreView {
  return value === 'sectors' || value === 'sub-industries' || value === 'watchlists' ? value : 'stocks'
}

export function exploreStockQuery(group?: unknown, groupType?: unknown): ScreenerQuery {
  const label = typeof group === 'string' ? group.trim() : ''
  if (!label || label.length > 120) return DEFAULT_SCREENER_QUERY
  const field = groupType === 'sub_industry' ? 'subIndustry' : 'sector'
  return { ...DEFAULT_SCREENER_QUERY, filters: [...DEFAULT_SCREENER_QUERY.filters, {
    id: 'explore-group', field, operator: 'in', value: [label], label: `${field === 'sector' ? 'Sector' : 'Sub-industry'}: ${label}`,
  }] }
}
