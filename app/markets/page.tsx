import { MarketsOverview } from '@/components/markets/MarketsOverview'
import { ILLUSTRATIVE_MARKET_OVERVIEW } from '@/lib/markets/fixtures'
import { fetchMarketBriefNews } from '@/lib/server/market-brief-news'
import { fetchLatestMarketOverview } from '@/lib/server/markets-repository'

export const revalidate = 300

export default async function MarketsOverviewPage() {
  const overview = await fetchLatestMarketOverview() ?? ILLUSTRATIVE_MARKET_OVERVIEW
  const news = await fetchMarketBriefNews(overview.candidates?.map((candidate) => candidate.symbol) ?? [])
  return <MarketsOverview overview={overview} news={news} />
}
