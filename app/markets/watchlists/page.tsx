import { MarketsWatchlists } from '@/components/markets/MarketsWatchlists'
import { runIllustrativeScreener } from '@/lib/markets/screener'
import type { ScreenerQuery, ScreenerResponse } from '@/lib/markets/types'
import { fetchLatestScreener } from '@/lib/server/markets-repository'

const WATCHLIST_UNIVERSE_QUERY: ScreenerQuery = {
  preset: 'momentum',
  filters: [],
  sort: 'symbol',
  direction: 'asc',
  page: 1,
  pageSize: 50,
}

async function loadWatchlistUniverse(): Promise<ScreenerResponse> {
  const firstPage = await fetchLatestScreener(WATCHLIST_UNIVERSE_QUERY)
  if (!firstPage) return runIllustrativeScreener(WATCHLIST_UNIVERSE_QUERY)
  const pageCount = Math.ceil(firstPage.total / firstPage.pageSize)
  if (pageCount <= 1) return firstPage

  const remainingPages = await Promise.all(
    Array.from({ length: pageCount - 1 }, (_, index) => fetchLatestScreener({
      ...WATCHLIST_UNIVERSE_QUERY,
      page: index + 2,
    })),
  )

  return {
    ...firstPage,
    rows: [firstPage, ...remainingPages.filter((page): page is ScreenerResponse => page !== null)]
      .flatMap((page) => page.rows),
    page: 1,
    pageSize: firstPage.total,
  }
}

export default async function MarketsWatchlistsPage() {
  return <MarketsWatchlists universe={await loadWatchlistUniverse()} />
}
