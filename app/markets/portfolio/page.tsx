import { MarketsWatchlists } from '@/components/markets/MarketsWatchlists'
import { runIllustrativeScreener } from '@/lib/markets/screener'
import type { ScreenerQuery, ScreenerResponse } from '@/lib/markets/types'
import { fetchLatestScreener } from '@/lib/server/markets-repository'

const PORTFOLIO_UNIVERSE_QUERY: ScreenerQuery = {
  preset: 'momentum',
  filters: [],
  sort: 'symbol',
  direction: 'asc',
  page: 1,
  pageSize: 50,
}

async function loadPortfolioUniverse(): Promise<ScreenerResponse> {
  const firstPage = await fetchLatestScreener(PORTFOLIO_UNIVERSE_QUERY)
  if (!firstPage) return runIllustrativeScreener(PORTFOLIO_UNIVERSE_QUERY)
  const pageCount = Math.ceil(firstPage.total / firstPage.pageSize)
  if (pageCount <= 1) return firstPage
  const remaining = await Promise.all(Array.from({ length: pageCount - 1 }, (_, index) =>
    fetchLatestScreener({ ...PORTFOLIO_UNIVERSE_QUERY, page: index + 2 })))
  return {
    ...firstPage,
    rows: [firstPage, ...remaining.filter((page): page is ScreenerResponse => page !== null)].flatMap((page) => page.rows),
    page: 1,
    pageSize: firstPage.total,
  }
}

export default async function MarketsPortfolioPage() {
  return (
    <div className="market-portfolio-page">
      <nav className="market-portfolio-tabs" aria-label="Portfolio workflow">
        <a href="#watchlists" aria-current="page">Watchlists</a>
        <a href="#ideas">Ideas</a>
        <a href="#owned">Owned</a>
        <a href="#decision-inbox">Decision Inbox</a>
        <a href="#history">History</a>
      </nav>
      <div id="watchlists"><MarketsWatchlists universe={await loadPortfolioUniverse()} /></div>
    </div>
  )
}
