import { MarketsExplore } from '@/components/markets/MarketsExplore'
import { DEFAULT_SCREENER_QUERY, runIllustrativeScreener } from '@/lib/markets/screener'
import { ENERGY_WATCHLIST_SYMBOLS } from '@/lib/markets/watchlists'
import type { ScreenerQuery, ScreenerResponse } from '@/lib/markets/types'
import { getAllowedMarketUser } from '@/lib/auth/markets-session'
import { fetchPortfolioWorkspace } from '@/lib/server/portfolio'
import { fetchLatestMarketLeadership, fetchLatestScreener, fetchLatestScreenerSymbols } from '@/lib/server/markets-repository'

type ExploreView = 'stocks' | 'sectors' | 'sub-industries' | 'watchlists'

const WATCHLIST_FALLBACK_QUERY: ScreenerQuery = {
  preset: 'momentum', filters: [], sort: 'symbol', direction: 'asc', page: 1, pageSize: 1_000,
}

function mergeWatchlistUniverse(base: ScreenerResponse, watchlistRows: ScreenerResponse): ScreenerResponse {
  const rows = [...watchlistRows.rows, ...base.rows].filter((row, index, all) => all.findIndex((candidate) => candidate.symbol === row.symbol) === index)
  return { ...watchlistRows, rows, total: rows.length, pageSize: rows.length }
}

export default async function MarketsExplorePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>
}) {
  const requested = (await searchParams).view
  const initialView: ExploreView = requested === 'sectors' || requested === 'sub-industries' || requested === 'watchlists' ? requested : 'stocks'
  const [screener, leadership, user] = await Promise.all([
    fetchLatestScreener(DEFAULT_SCREENER_QUERY),
    fetchLatestMarketLeadership(),
    getAllowedMarketUser(),
  ])
  const resolvedScreener = screener ?? runIllustrativeScreener(DEFAULT_SCREENER_QUERY)
  const workspace = user
    ? await fetchPortfolioWorkspace(user.id, resolvedScreener.rows.map((row) => ({ symbol: row.symbol, price: row.price })))
    : null
  const watchlistSymbols = [...new Set([
    ...ENERGY_WATCHLIST_SYMBOLS,
    ...(workspace?.watchlists.lists.flatMap((list) => list.symbols) ?? []),
  ])]
  const liveWatchlistRows = await fetchLatestScreenerSymbols(watchlistSymbols)
  const watchlistRows = liveWatchlistRows ?? (() => {
    const fallback = runIllustrativeScreener(WATCHLIST_FALLBACK_QUERY)
    return { ...fallback, rows: fallback.rows.filter((row) => watchlistSymbols.includes(row.symbol)), total: watchlistSymbols.length, pageSize: watchlistSymbols.length }
  })()
  return (
    <MarketsExplore
      initialView={initialView}
      screener={resolvedScreener}
      watchlistUniverse={mergeWatchlistUniverse(resolvedScreener, watchlistRows)}
      leadership={leadership}
      watchlists={workspace?.watchlists}
      watchlistsPersisted={workspace?.watchlistsPersisted}
    />
  )
}
