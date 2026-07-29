import { PortfolioWorkspace } from '@/components/markets/PortfolioWorkspace'
import { requireAllowedMarketUser } from '@/lib/auth/markets-session'
import { runIllustrativeScreener } from '@/lib/markets/screener'
import type { ScreenerQuery, ScreenerResponse } from '@/lib/markets/types'
import { fetchPortfolioWorkspace } from '@/lib/server/portfolio'
import { fetchLatestScreener } from '@/lib/server/markets-repository'

const PORTFOLIO_UNIVERSE_QUERY: ScreenerQuery = {
  preset: 'momentum', filters: [], sort: 'symbol', direction: 'asc', page: 1, pageSize: 1_000,
}

async function loadPortfolioUniverse(): Promise<ScreenerResponse> {
  return await fetchLatestScreener(PORTFOLIO_UNIVERSE_QUERY)
    ?? runIllustrativeScreener(PORTFOLIO_UNIVERSE_QUERY)
}

export default async function MarketsPortfolioPage() {
  const [user, universe] = await Promise.all([
    requireAllowedMarketUser(),
    loadPortfolioUniverse(),
  ])
  const data = await fetchPortfolioWorkspace(user.id, universe.rows.map((row) => row.symbol))
  return <PortfolioWorkspace initialData={data} universe={universe} />
}
