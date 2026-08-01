import { MarketsExplore } from '@/components/markets/MarketsExplore'
import { DEFAULT_SCREENER_QUERY, runIllustrativeScreener } from '@/lib/markets/screener'
import { getAllowedMarketUser } from '@/lib/auth/markets-session'
import { fetchPortfolioWorkspace } from '@/lib/server/portfolio'
import { fetchLatestMarketLeadership, fetchLatestScreener } from '@/lib/server/markets-repository'

type ExploreView = 'stocks' | 'sectors' | 'sub-industries' | 'watchlists'

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
  return (
    <MarketsExplore
      initialView={initialView}
      screener={resolvedScreener}
      leadership={leadership}
      watchlists={workspace?.watchlists}
      watchlistsPersisted={workspace?.watchlistsPersisted}
    />
  )
}
