import { MarketsOverview } from '@/components/markets/MarketsOverview'
import { requireAllowedMarketUser } from '@/lib/auth/markets-session'
import { ILLUSTRATIVE_MARKET_OVERVIEW } from '@/lib/markets/fixtures'
import { buildMarketThesisBrief } from '@/lib/markets/thesis-brief'
import { fetchMarketBriefNews } from '@/lib/server/market-brief-news'
import { fetchLatestMarketOverview } from '@/lib/server/markets-repository'
import { fetchMarketThesisWorkspace } from '@/lib/server/world-memory'

export const revalidate = 300

export default async function MarketsOverviewPage() {
  const user = await requireAllowedMarketUser()
  const [storedOverview, thesisWorkspace] = await Promise.all([
    fetchLatestMarketOverview(),
    fetchMarketThesisWorkspace(user.id).catch(() => null),
  ])
  const overview = storedOverview ?? ILLUSTRATIVE_MARKET_OVERVIEW
  const news = await fetchMarketBriefNews(overview.candidates?.map((candidate) => candidate.symbol) ?? [])
  const thesisBrief = thesisWorkspace ? buildMarketThesisBrief(thesisWorkspace) : null
  return <MarketsOverview overview={overview} news={news} thesisBrief={thesisBrief} />
}
