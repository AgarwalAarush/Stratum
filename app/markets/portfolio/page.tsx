import { PortfolioWorkspace } from '@/components/markets/PortfolioWorkspace'
import { requireAllowedMarketUser } from '@/lib/auth/markets-session'
import { runIllustrativeScreener } from '@/lib/markets/screener'
import type { ScreenerQuery, ScreenerResponse } from '@/lib/markets/types'
import { fetchPortfolioWorkspace } from '@/lib/server/portfolio'
import { fetchLatestScreenerSymbols } from '@/lib/server/markets-repository'

const PORTFOLIO_UNIVERSE_QUERY: ScreenerQuery = {
  preset: 'momentum', filters: [], sort: 'symbol', direction: 'asc', page: 1, pageSize: 1_000,
}

async function loadPortfolioUniverse(symbols: string[]): Promise<ScreenerResponse> {
  const live = await fetchLatestScreenerSymbols(symbols)
  if (live) return live
  const illustrative = runIllustrativeScreener(PORTFOLIO_UNIVERSE_QUERY)
  const requested = new Set(symbols)
  const rows = illustrative.rows.filter((row) => requested.has(row.symbol))
  return { ...illustrative, rows, total: rows.length, pageSize: rows.length }
}

export default async function MarketsPortfolioPage() {
  const user = await requireAllowedMarketUser()
  const initialData = await fetchPortfolioWorkspace(user.id)
  const symbols = [...new Set(initialData.portfolios.flatMap((portfolio) => portfolio.holdings.map((holding) => holding.symbol)))]
  const universe = await loadPortfolioUniverse(symbols)
  const data = await fetchPortfolioWorkspace(user.id, universe.rows.map((row) => ({
    symbol: row.symbol,
    price: row.price,
  })))
  return <PortfolioWorkspace initialData={data} universe={universe}
    key={data.portfolioTransactions.map((transaction) => transaction.id).join(':')}
  />
}
