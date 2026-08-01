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

export interface StockSearchResponse {
  results: StockSearchResult[]
  feed: string
  dataAsOf: string
  stale: boolean
}

const STALE_AFTER_MS = 20 * 60 * 1_000
const MAX_CANDIDATES = 50

function safeSearchTerm(input: string): string {
  return input.trim().replace(/[,()%]/g, '').slice(0, 80)
}

/**
 * Reads matches from the latest materialized screener snapshot. Search never
 * calls a quote provider and is intentionally bounded before ranking locally.
 */
export async function searchLatestStocks(input: string, limit = 8): Promise<StockSearchResponse | null> {
  const query = safeSearchTerm(input)
  const supabase = getSupabaseClient()
  const snapshot = await fetchLatestSnapshotMeta()
  if (!query || !supabase || !snapshot) return null

  const { data, error } = await supabase
    .from('screener_rows')
    .select('symbol,company,exchange,price,daily_change,data_as_of')
    .eq('snapshot_id', snapshot.id)
    .or(`symbol.ilike.%${query}%,company.ilike.%${query}%`)
    .limit(MAX_CANDIDATES)
  if (error) return null

  const candidates = ((data ?? []) as StockSearchRecord[]).map((row) => ({
    symbol: row.symbol,
    company: row.company,
    exchange: row.exchange,
    price: Number(row.price),
    dailyChange: Number(row.daily_change),
    asOf: row.data_as_of,
  }))
  return {
    results: rankStockSearchResults(candidates, query, limit),
    feed: snapshot.feed,
    dataAsOf: snapshot.data_as_of,
    stale: Date.now() - Date.parse(snapshot.data_as_of) > STALE_AFTER_MS,
  }
}
