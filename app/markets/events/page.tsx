import { MarketsFeedPage } from '@/components/markets/MarketsFeedPage'
import { fetchFinanceDeals } from '@/lib/data/finance-deals'
import { fetchMacroIndicators } from '@/lib/data/finance-macro'
import { fetchFinanceReports } from '@/lib/data/finance-reports'
import { fetchPersistedFmpMarketItems } from '@/lib/data/fmp-intelligence'
import { mergeMarketNews, rankMarketEvents } from '@/lib/markets/news'
import { requireAllowedMarketUser } from '@/lib/auth/markets-session'
import { fetchPortfolioWorkspace } from '@/lib/server/portfolio'

export default async function MarketsEventsPage({
  searchParams,
}: {
  searchParams: Promise<{ symbol?: string }>
}) {
  const { symbol: requestedSymbol = '' } = await searchParams
  const focusedSymbol = /^[A-Z][A-Z0-9.-]{0,11}$/.test(requestedSymbol.toUpperCase())
    ? requestedSymbol.toUpperCase()
    : ''
  const userPromise = requireAllowedMarketUser()
  const portfolioPromise = userPromise.then((user) => fetchPortfolioWorkspace(user.id))
  const [fmp, deals, macro, research, portfolio] = await Promise.all([
    fetchPersistedFmpMarketItems(['fmp-stock-news', 'fmp-press-releases', 'fmp-sec-filings'], 50).catch(() => []),
    fetchFinanceDeals(16).catch(() => []),
    fetchMacroIndicators(16).catch(() => []),
    fetchFinanceReports(16).catch(() => []),
    portfolioPromise,
  ])
  const relevantSymbols = [
    focusedSymbol,
    ...portfolio.positions.map((position) => position.symbol),
    ...portfolio.decisions.map((decision) => decision.symbol),
    ...portfolio.watchlists.lists.flatMap((list) => list.symbols),
  ]
  const items = rankMarketEvents(mergeMarketNews([fmp, deals, macro, research], 70), relevantSymbols)
  return (
    <MarketsFeedPage
      eyebrow="Ranked event stream"
      title={focusedSymbol ? `${focusedSymbol} events and context` : 'Events requiring context'}
      description="Company news, filings, deals, earnings context, and macro releases in one evidence stream. Owned, watched, and actively researched names are promoted as portfolio state becomes available."
      items={items}
      emptyMessage="No verified event is inside the current lookback window."
    />
  )
}
