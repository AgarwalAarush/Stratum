import { MarketsOverview } from '@/components/markets/MarketsOverview'
import { ILLUSTRATIVE_MARKET_OVERVIEW } from '@/lib/markets/fixtures'

export default function MarketsOverviewPage() {
  return <MarketsOverview overview={ILLUSTRATIVE_MARKET_OVERVIEW} />
}
