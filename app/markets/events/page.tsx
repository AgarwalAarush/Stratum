import { MarketsFeedPage } from '@/components/markets/MarketsFeedPage'
import { fetchFinanceDeals } from '@/lib/data/finance-deals'
import { fetchMacroIndicators } from '@/lib/data/finance-macro'
import { fetchFinanceReports } from '@/lib/data/finance-reports'
import { fetchPersistedFmpMarketItems } from '@/lib/data/fmp-intelligence'
import { mergeMarketNews } from '@/lib/markets/news'

export default async function MarketsEventsPage() {
  const [fmp, deals, macro, research] = await Promise.all([
    fetchPersistedFmpMarketItems(['fmp-stock-news', 'fmp-press-releases', 'fmp-sec-filings'], 50).catch(() => []),
    fetchFinanceDeals(16).catch(() => []),
    fetchMacroIndicators(16).catch(() => []),
    fetchFinanceReports(16).catch(() => []),
  ])
  const items = mergeMarketNews([fmp, deals, macro, research], 70)
  return (
    <MarketsFeedPage
      eyebrow="Ranked event stream"
      title="Events requiring context"
      description="Company news, filings, deals, earnings context, and macro releases in one evidence stream. Owned, watched, and actively researched names are promoted as portfolio state becomes available."
      items={items}
      emptyMessage="No verified event is inside the current lookback window."
    />
  )
}
