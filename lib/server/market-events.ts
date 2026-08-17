import { fetchFinanceDeals } from '@/lib/data/finance-deals'
import { fetchMacroIndicators } from '@/lib/data/finance-macro'
import { fetchFinanceReports } from '@/lib/data/finance-reports'
import { fetchPersistedFmpMarketItems } from '@/lib/data/fmp-intelligence'
import { rankMarketEvents, mergeMarketNews } from '@/lib/markets/news'
import type { NewsItem } from '@/lib/types'
import { AsyncTtlCache } from './async-ttl-cache'
import { cachedFetchWithFallback } from './cache'

const MARKET_EVENTS_CACHE_MS = 5 * 60 * 1_000
const MARKET_EVENTS_SHARED_CACHE_SECONDS = 5 * 60
const marketEventsCache = new AsyncTtlCache<NewsItem[]>({ maxEntries: 16 })

function normalizeSymbols(symbols: Iterable<string>): string[] {
  return [...new Set([...symbols]
    .map((symbol) => symbol.trim().toUpperCase())
    .filter((symbol) => /^[A-Z][A-Z0-9.-]{0,11}$/.test(symbol)))]
    .sort()
    .slice(0, 80)
}

async function loadMarketEvents(symbols: string[]): Promise<NewsItem[]> {
  const [fmp, deals, macro, research] = await Promise.all([
    fetchPersistedFmpMarketItems(['fmp-stock-news', 'fmp-press-releases', 'fmp-sec-filings'], 50).catch(() => []),
    fetchFinanceDeals(16).catch(() => []),
    fetchMacroIndicators(16).catch(() => []),
    fetchFinanceReports(16).catch(() => []),
  ])
  return rankMarketEvents(mergeMarketNews([fmp, deals, macro, research], 70), symbols)
}

/**
 * Event source collection can wait until the Events shell is visible. The
 * resulting read model is shared for a short period and never holds a route
 * transition open on slow RSS or macro providers.
 */
export async function fetchMarketEvents(relevantSymbols: Iterable<string> = []): Promise<NewsItem[]> {
  const symbols = normalizeSymbols(relevantSymbols)
  const keySuffix = symbols.join(',') || 'market'
  return marketEventsCache.get(keySuffix, MARKET_EVENTS_CACHE_MS, async () => {
    const result = await cachedFetchWithFallback({
      key: `stratum:markets:events:v1:${keySuffix}`,
      ttlSeconds: MARKET_EVENTS_SHARED_CACHE_SECONDS,
      fetcher: () => loadMarketEvents(symbols),
    })
    return result.data
  }).then((items) => items ?? [])
}
