import { MarketsOverview } from '@/components/markets/MarketsOverview'
import { requireAllowedMarketUser } from '@/lib/auth/markets-session'
import { ILLUSTRATIVE_MARKET_OVERVIEW } from '@/lib/markets/fixtures'
import { fetchLatestMarketOverview } from '@/lib/server/markets-repository'
import { fetchCausalModelSnapshot } from '@/lib/server/causal-model'
import { MarketCausalBrief } from '@/components/markets/MarketCausalBrief'

export const revalidate = 300

export default async function MarketsOverviewPage() {
  await requireAllowedMarketUser()
  const [storedOverview, causal] = await Promise.all([fetchLatestMarketOverview(), fetchCausalModelSnapshot()])
  const overview = storedOverview ?? ILLUSTRATIVE_MARKET_OVERVIEW
  return <><MarketsOverview overview={overview} /><MarketCausalBrief world={causal.world} marketTheses={causal.marketTheses} /></>
}
