import { MarketsOverview } from '@/components/markets/MarketsOverview'
import { requireAllowedMarketUser } from '@/lib/auth/markets-session'
import { ILLUSTRATIVE_MARKET_OVERVIEW } from '@/lib/markets/fixtures'
import { fetchLatestMarketOverview } from '@/lib/server/markets-repository'

export const revalidate = 300

export default async function MarketsOverviewPage() {
  await requireAllowedMarketUser()
  const storedOverview = await fetchLatestMarketOverview()
  const overview = storedOverview ?? ILLUSTRATIVE_MARKET_OVERVIEW
  return <MarketsOverview overview={overview} />
}
