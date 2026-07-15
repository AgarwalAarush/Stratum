import { MarketsOverview } from '@/components/markets/MarketsOverview'
import { ILLUSTRATIVE_MARKET_OVERVIEW } from '@/lib/markets/fixtures'
import { fetchLatestMarketOverview } from '@/lib/server/markets-repository'

export default async function MarketsOverviewPage() {
  const overview = await fetchLatestMarketOverview() ?? ILLUSTRATIVE_MARKET_OVERVIEW
  return <MarketsOverview overview={overview} />
}
