import { createDefaultWatchlistState, ensureEnergyWatchlist, type MarketWatchlistState } from '../markets/watchlists.ts'
import { getSupabaseClient } from './supabase.ts'

export async function fetchMarketWatchlists(ownerId: string): Promise<{ watchlists: MarketWatchlistState; persisted: boolean }> {
  const client = getSupabaseClient()
  if (!client) throw new Error('Saved watchlists are unavailable')
  const { data, error } = await client.from('market_watchlists')
    .select('id,client_id,name,market_watchlist_items(symbol)').eq('owner_id', ownerId)
    .order('created_at').abortSignal(AbortSignal.timeout(8_000))
  if (error) throw new Error('Saved watchlists could not be loaded')
  const lists = (data ?? []).map(row => ({
    id: row.client_id ?? row.id, name: row.name,
    symbols: (row.market_watchlist_items ?? []).map((item: { symbol: string }) => item.symbol),
  }))
  return {
    watchlists: ensureEnergyWatchlist(lists.length ? { version: 1, activeListId: lists[0].id, lists } : createDefaultWatchlistState([])),
    persisted: lists.length > 0,
  }
}
