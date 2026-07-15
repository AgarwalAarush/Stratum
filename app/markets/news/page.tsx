import { MarketsFeedPage } from '@/components/markets/MarketsFeedPage'
import { fetchFinanceDeals } from '@/lib/data/finance-deals'
import { fetchMacroIndicators } from '@/lib/data/finance-macro'
import { fetchFinanceReports } from '@/lib/data/finance-reports'
import { mergeMarketNews } from '@/lib/markets/news'

export default async function MarketsNewsPage() {
  const [deals, macro, research] = await Promise.all([
    fetchFinanceDeals(16).catch(() => []),
    fetchMacroIndicators(12).catch(() => []),
    fetchFinanceReports(12).catch(() => []),
  ])
  const items = mergeMarketNews([deals, macro, research], 36)

  return (
    <MarketsFeedPage
      eyebrow="Market news"
      title="Signals moving capital"
      description="A normalized stream of deals, macro releases, and institutional research. Recency is preserved; duplicate headlines and tracking URLs are suppressed upstream."
      items={items}
      emptyMessage="No verified market-moving item is currently available."
    />
  )
}
