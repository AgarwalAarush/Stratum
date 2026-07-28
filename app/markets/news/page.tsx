import { MarketsFeedPage } from '@/components/markets/MarketsFeedPage'
import { fetchFinanceDeals } from '@/lib/data/finance-deals'
import { fetchMacroIndicators } from '@/lib/data/finance-macro'
import { fetchFinanceReports } from '@/lib/data/finance-reports'
import { fetchPersistedFmpMarketItems } from '@/lib/data/fmp-intelligence'
import { mergeMarketNews } from '@/lib/markets/news'

export default async function MarketsNewsPage() {
  const [fmp, deals, macro, research] = await Promise.all([
    fetchPersistedFmpMarketItems(['fmp-stock-news', 'fmp-press-releases'], 24).catch(() => []),
    fetchFinanceDeals(16).catch(() => []),
    fetchMacroIndicators(12).catch(() => []),
    fetchFinanceReports(12).catch(() => []),
  ])
  const items = mergeMarketNews([fmp, deals, macro, research], 36)

  return (
    <MarketsFeedPage
      eyebrow="Market news"
      title="Signals moving capital"
      description="A normalized stream of FMP company news and press releases, deals, macro releases, and institutional research. Recency is preserved; duplicate headlines and tracking URLs are suppressed upstream."
      items={items}
      emptyMessage="No verified market-moving item is currently available."
    />
  )
}
