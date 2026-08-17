import { fetchFinanceDeals } from '@/lib/data/finance-deals'
import { fetchMacroIndicators } from '@/lib/data/finance-macro'
import { fetchFinanceReports } from '@/lib/data/finance-reports'
import { fetchPersistedFmpMarketItems } from '@/lib/data/fmp-intelligence'
import { selectMarketBriefNews } from '@/lib/markets/brief-news'
import { mergeMarketNews } from '@/lib/markets/news'
import { AsyncTtlCache } from './async-ttl-cache'
import { cachedFetchWithFallback } from './cache'
import type { NewsItem } from '@/lib/types'

const MARKET_BRIEF_NEWS_CACHE_MS = 5 * 60 * 1_000
const MARKET_BRIEF_NEWS_SHARED_CACHE_SECONDS = 5 * 60
const marketBriefNewsCache = new AsyncTtlCache<NewsItem[]>({ maxEntries: 16 })

function normalizeRelevantSymbols(relevantSymbols: Iterable<string>): string[] {
  return [...new Set([...relevantSymbols]
    .map((symbol) => symbol.trim().toUpperCase())
    .filter((symbol) => /^[A-Z][A-Z0-9.-]{0,11}$/.test(symbol)))]
    .sort()
    .slice(0, 12)
}

async function loadMarketBriefNews(relevantSymbols: string[]): Promise<NewsItem[]> {
  const [fmp, deals, macro, research] = await Promise.all([
    fetchPersistedFmpMarketItems(['fmp-stock-news', 'fmp-press-releases', 'fmp-sec-filings'], 40).catch(() => []),
    fetchFinanceDeals(12).catch(() => []),
    fetchMacroIndicators(12).catch(() => []),
    fetchFinanceReports(12).catch(() => []),
  ])

  return selectMarketBriefNews(mergeMarketNews([fmp, deals, macro, research], 60), relevantSymbols)
}

/**
 * The overview gets a small source-linked read from the same normalized feeds
 * as Events. Each upstream fetch is already cached or persisted; failures are
 * isolated so a temporary source issue never hides the market snapshot.
 */
export async function fetchMarketBriefNews(relevantSymbols: Iterable<string> = []): Promise<NewsItem[]> {
  const symbols = normalizeRelevantSymbols(relevantSymbols)
  const keySuffix = symbols.join(',') || 'market'
  return marketBriefNewsCache.get(keySuffix, MARKET_BRIEF_NEWS_CACHE_MS, async () => {
    const result = await cachedFetchWithFallback({
      key: `stratum:markets:brief-news:v1:${keySuffix}`,
      ttlSeconds: MARKET_BRIEF_NEWS_SHARED_CACHE_SECONDS,
      fetcher: () => loadMarketBriefNews(symbols),
    })
    return result.data
  }).then((items) => items ?? [])
}
