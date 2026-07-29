import { MarketsExplore } from '@/components/markets/MarketsExplore'
import { DEFAULT_SCREENER_QUERY, runIllustrativeScreener } from '@/lib/markets/screener'
import { fetchLatestMarketLeadership, fetchLatestScreener } from '@/lib/server/markets-repository'

type ExploreView = 'stocks' | 'sectors' | 'sub-industries'

export default async function MarketsExplorePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>
}) {
  const requested = (await searchParams).view
  const initialView: ExploreView = requested === 'sectors' || requested === 'sub-industries' ? requested : 'stocks'
  const [screener, leadership] = await Promise.all([
    fetchLatestScreener(DEFAULT_SCREENER_QUERY),
    fetchLatestMarketLeadership(),
  ])
  return (
    <MarketsExplore
      initialView={initialView}
      screener={screener ?? runIllustrativeScreener(DEFAULT_SCREENER_QUERY)}
      leadership={leadership}
    />
  )
}
