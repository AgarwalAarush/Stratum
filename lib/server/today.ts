import { getSupabaseClient } from './supabase.ts'
import { AsyncTtlCache } from './async-ttl-cache.ts'
import {
  summarizeTodayDecisions,
  type TodayDecision,
} from '../markets/today.ts'
import type { MarketInstrument, MarketGroupMetric } from '../markets/types.ts'

export interface TodayMarket {
  data_as_of: string
  feed: string
  regime: string
  instruments: MarketInstrument[]
  sectors: MarketGroupMetric[]
  risks: string[]
  catalysts: string[]
}
interface PortfolioInput {
  account: { id: string; name: string }
  dataAsOf: string
  dataSource: string
  marketValue: number | null
  totalValue: number | null
  cashBalance: number | null
  allocationBudget?: { total: number; holdingsValue: number }
}
export interface TodayPortfolio {
  publishedAt: string
  decisions: TodayDecision[]
  accounts: Array<{
    id: string
    name: string
    asOf: string
    source: string
    budget: boolean
    total: number | null
    invested: number | null
    available: number | null
  }>
}
const marketCache = new AsyncTtlCache<TodayMarket>()
const portfolioCache = new AsyncTtlCache<TodayPortfolio>()
function db() {
  const client = getSupabaseClient()
  if (!client) throw new Error('Database unavailable')
  return client
}

// Read only published, durable projections. Never rebuild a market snapshot on a page view.
export function fetchTodayMarket() {
  return marketCache.get('today', 30_000, async () => {
    const result = await db()
      .from('market_home_snapshots')
      .select(
        'data_as_of,feed:content->feed,regime:content->state->regime,instruments:content->instruments,sectors:content->leadership->sectors,risks:content->memo->risks,catalysts:content->memo->catalysts,market_snapshots!inner(status)',
      )
      .eq('market_snapshots.status', 'complete')
      .order('generated_at', { ascending: false })
      .limit(1)
      .abortSignal(AbortSignal.timeout(4_000))
      .maybeSingle()
    if (result.error) throw new Error(result.error.message)
    if (!result.data) return null
    const row = result.data as unknown as TodayMarket
    return {
      data_as_of: row.data_as_of,
      feed: row.feed,
      regime: row.regime,
      instruments: (row.instruments ?? []).slice(0, 6),
      sectors: (row.sectors ?? []).slice(0, 11),
      risks: (row.risks ?? []).slice(0, 1),
      catalysts: (row.catalysts ?? []).slice(0, 1),
    }
  })
}

export function fetchTodayPortfolio(ownerId: string) {
  return portfolioCache.get(ownerId, 30_000, async () => {
    const client = db()
    const signal = AbortSignal.timeout(4_000)
    const batch = await client
      .from('recommendation_batches')
      .select('id,manifest_id,published_at')
      .eq('owner_id', ownerId)
      .order('published_at', { ascending: false })
      .limit(1)
      .abortSignal(signal)
      .maybeSingle()
    if (batch.error) throw new Error(batch.error.message)
    if (!batch.data) return null
    const [decisions, manifest] = await Promise.all([
      client
        .from('recommendation_versions')
        .select(
          'symbol,action,portfolio_id,reason:content->reason,expires_at:content->expiresAt,gate_reasons:content->gateReasons',
        )
        .eq('owner_id', ownerId)
        .eq('batch_id', batch.data.id)
        .order('symbol')
        .abortSignal(signal),
      // PostgreSQL projects the portfolio, not the multi-megabyte frozen evidence manifest.
      client
        .from('recommendation_input_manifests')
        .select('portfolio:content->portfolio')
        .eq('owner_id', ownerId)
        .eq('id', batch.data.manifest_id)
        .abortSignal(signal)
        .single(),
    ])
    if (decisions.error || manifest.error)
      throw new Error('Today portfolio read unavailable')
    const portfolios = (manifest.data?.portfolio ??
      []) as unknown as PortfolioInput[]
    return {
      publishedAt: batch.data.published_at,
      decisions: decisions.data as unknown as TodayDecision[],
      accounts: portfolios.map((p) => ({
        id: p.account.id,
        name: p.account.name,
        asOf: p.dataAsOf,
        source: p.dataSource,
        budget: Boolean(p.allocationBudget),
        total: p.allocationBudget?.total ?? p.totalValue,
        invested: p.allocationBudget?.holdingsValue ?? p.marketValue,
        available: p.cashBalance,
      })),
    }
  })
}

// Re-evaluate expiry at render time, even when the source projection is cached.
export { summarizeTodayDecisions }
