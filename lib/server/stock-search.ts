import { rankStockSearchResults, type StockSearchResult } from '../markets/stock-search.ts'
import { fetchLatestSnapshotMeta } from './markets-repository.ts'
import { getSupabaseClient } from './supabase.ts'

interface StockSearchRecord {
  symbol: string
  company: string
  exchange: string
  price: number | string
  daily_change: number | string
  data_as_of: string
}

interface MarketAssetSearchRecord {
  symbol: string
  name: string
  exchange: string
}

export interface StockSearchResponse {
  results: StockSearchResult[]
  feed: string | null
  dataAsOf: string | null
  stale: boolean
}

const STALE_AFTER_MS = 20 * 60 * 1_000
const MAX_CANDIDATES = 50

function safeSearchTerm(input: string): string {
  return input.trim().replace(/[^a-z0-9 .-]/gi, '').slice(0, 80)
}

/**
 * Search joins the active Alpaca asset catalog with the latest materialized
 * screener snapshot. That keeps newly listed or newly requested equities
 * discoverable before they have enough daily history for every screener metric.
 */
export async function searchLatestStocks(input: string, limit = 8): Promise<StockSearchResponse | null> {
  const query = safeSearchTerm(input)
  const supabase = getSupabaseClient()
  const snapshot = await fetchLatestSnapshotMeta()
  if (!query || !supabase) return null

  const assetsPromise = supabase
    .from('market_assets')
    .select('symbol,name,exchange')
    .eq('active', true)
    .eq('tradable', true)
    .or(`symbol.ilike.%${query}%,name.ilike.%${query}%`)
    .limit(MAX_CANDIDATES)
  const screenerPromise = snapshot
    ? supabase
      .from('screener_rows')
      .select('symbol,company,exchange,price,daily_change,data_as_of')
      .eq('snapshot_id', snapshot.id)
      .or(`symbol.ilike.%${query}%,company.ilike.%${query}%`)
      .limit(MAX_CANDIDATES)
    : Promise.resolve({ data: [], error: null })
  const [{ data: assetData, error: assetError }, { data: screenerData, error: screenerError }] = await Promise.all([
    assetsPromise,
    screenerPromise,
  ])
  if (assetError || screenerError) return null

  const screenerBySymbol = new Map(((screenerData ?? []) as StockSearchRecord[]).map((row) => [row.symbol, row]))
  const candidates = ((assetData ?? []) as MarketAssetSearchRecord[]).map((asset) => {
    const screener = screenerBySymbol.get(asset.symbol)
    return {
      symbol: asset.symbol,
      company: screener?.company ?? asset.name,
      exchange: screener?.exchange ?? asset.exchange,
      price: screener ? Number(screener.price) : null,
      dailyChange: screener ? Number(screener.daily_change) : null,
      asOf: screener?.data_as_of ?? null,
      screenable: Boolean(screener),
    }
  })
  return {
    results: rankStockSearchResults(candidates, query, limit),
    feed: snapshot?.feed ?? null,
    dataAsOf: snapshot?.data_as_of ?? null,
    stale: !snapshot || Date.now() - Date.parse(snapshot.data_as_of) > STALE_AFTER_MS,
  }
}
