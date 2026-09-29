import { getSupabaseClient } from './supabase.ts'
import { AsyncTtlCache } from './async-ttl-cache.ts'
import { cachedFetchWithFallback } from './cache.ts'
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
  return marketCache.get('today', 5_000, async () => (await cachedFetchWithFallback({
    key: 'stratum:markets:today:market:v2', ttlSeconds: 60, negativeTtlSeconds: 5, staleMaxAgeMs: 120_000,
    fetcher: async () => {
      const result = await db()
        .from('market_home_snapshots')
        .select(
          'data_as_of,feed:content->feed,regime:content->state->regime,instruments:content->instruments,sectors:content->leadership->sectors,risks:content->memo->risks,catalysts:content->memo->catalysts,market_snapshots!inner(status)',
        )
        .eq('market_snapshots.status', 'complete')
        .order('generated_at', { ascending: false })
        .limit(1)
        .abortSignal(AbortSignal.timeout(8_000))
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
    },
  })).data)
}

export function fetchTodayPortfolio(ownerId: string) {
  return portfolioCache.get(ownerId, 5_000, async () => (await cachedFetchWithFallback({
    key: `stratum:markets:today:portfolio:${ownerId}:v3`, ttlSeconds: 60, negativeTtlSeconds: 5, staleMaxAgeMs: 120_000,
    fetcher: async () => {
      const client = db()
      const signal = AbortSignal.timeout(8_000)
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
      const latest = batch.data
      return (await cachedFetchWithFallback<TodayPortfolio>({
        key: `stratum:markets:today:edition:${ownerId}:${latest.id}:v1`, ttlSeconds: 86_400, staleMaxAgeMs: 86_400_000,
        fetcher: async () => {
          const [decisions, manifest] = await Promise.all([
            client.from('recommendation_versions')
              .select('symbol,action,portfolio_id,reason:content->reason,expires_at:content->expiresAt,gate_reasons:content->gateReasons')
              .eq('owner_id', ownerId).eq('batch_id', latest.id).order('symbol').abortSignal(signal),
            client.from('recommendation_input_manifests').select('portfolio:content->portfolio')
              .eq('owner_id', ownerId).eq('id', latest.manifest_id).abortSignal(signal).single(),
          ])
          if (decisions.error || manifest.error) throw new Error('Today portfolio read unavailable')
          const portfolios = (manifest.data.portfolio ?? []) as unknown as PortfolioInput[]
          return {
            publishedAt: latest.published_at,
            decisions: decisions.data as unknown as TodayDecision[],
            accounts: portfolios.map((portfolio) => ({
              id: portfolio.account.id,
              name: portfolio.account.name,
              asOf: portfolio.dataAsOf,
              source: portfolio.dataSource,
              budget: Boolean(portfolio.allocationBudget),
              total: portfolio.allocationBudget?.total ?? portfolio.totalValue,
              invested: portfolio.allocationBudget?.holdingsValue ?? portfolio.marketValue,
              available: portfolio.cashBalance,
            })),
          }
        },
      })).data
    },
  })).data)
}

// Re-evaluate expiry at render time, even when the source projection is cached.
export { summarizeTodayDecisions }
