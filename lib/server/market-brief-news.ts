import { fetchFinanceDeals } from '@/lib/data/finance-deals'
import { fetchMacroIndicators } from '@/lib/data/finance-macro'
import { fetchFinanceReports } from '@/lib/data/finance-reports'
import { fetchPersistedFmpMarketItems } from '@/lib/data/fmp-intelligence'
import { selectMarketBriefNews } from '@/lib/markets/brief-news'
import { mergeMarketNews } from '@/lib/markets/news'
import type { NewsItem } from '@/lib/types'

/**
 * The overview gets a small source-linked read from the same normalized feeds
 * as Events. Each upstream fetch is already cached or persisted; failures are
 * isolated so a temporary source issue never hides the market snapshot.
 */
export async function fetchMarketBriefNews(relevantSymbols: Iterable<string> = []): Promise<NewsItem[]> {
  const [fmp, deals, macro, research] = await Promise.all([
    fetchPersistedFmpMarketItems(['fmp-stock-news', 'fmp-press-releases', 'fmp-sec-filings'], 40).catch(() => []),
    fetchFinanceDeals(12).catch(() => []),
    fetchMacroIndicators(12).catch(() => []),
    fetchFinanceReports(12).catch(() => []),
  ])

  return selectMarketBriefNews(mergeMarketNews([fmp, deals, macro, research], 60), relevantSymbols)
}
