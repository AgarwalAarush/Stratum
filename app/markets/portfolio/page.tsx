import { PortfolioWorkspace } from '@/components/markets/PortfolioWorkspace'
import { requireAllowedMarketUser } from '@/lib/auth/markets-session'
import { runIllustrativeScreener } from '@/lib/markets/screener'
import type { ScreenerQuery, ScreenerResponse } from '@/lib/markets/types'
import { fetchPortfolioWorkspace } from '@/lib/server/portfolio'
import { fetchLatestScreener } from '@/lib/server/markets-repository'

const PORTFOLIO_UNIVERSE_QUERY: ScreenerQuery = {
  preset: 'momentum', filters: [], sort: 'symbol', direction: 'asc', page: 1, pageSize: 50,
}

async function loadPortfolioUniverse(): Promise<ScreenerResponse> {
  const firstPage = await fetchLatestScreener(PORTFOLIO_UNIVERSE_QUERY)
  if (!firstPage) return runIllustrativeScreener(PORTFOLIO_UNIVERSE_QUERY)
  const pageCount = Math.ceil(firstPage.total / firstPage.pageSize)
  const remaining = pageCount <= 1 ? [] : await Promise.all(Array.from({ length: pageCount - 1 }, (_, index) =>
    fetchLatestScreener({ ...PORTFOLIO_UNIVERSE_QUERY, page: index + 2 })))
  return {
    ...firstPage,
    rows: [firstPage, ...remaining.filter((page): page is ScreenerResponse => page !== null)].flatMap((page) => page.rows),
    page: 1,
    pageSize: firstPage.total,
  }
}

export default async function MarketsPortfolioPage() {
  const user = await requireAllowedMarketUser()
  const universe = await loadPortfolioUniverse()
  const data = await fetchPortfolioWorkspace(user.id, universe.rows.map((row) => row.symbol))
  return <PortfolioWorkspace initialData={data} universe={universe} />
}
