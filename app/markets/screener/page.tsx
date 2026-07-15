import { MarketsScreener } from '@/components/markets/MarketsScreener'
import { DEFAULT_SCREENER_QUERY, runIllustrativeScreener } from '@/lib/markets/screener'
import { fetchLatestScreener } from '@/lib/server/markets-repository'

export default async function MarketsScreenerPage() {
  const response = await fetchLatestScreener(DEFAULT_SCREENER_QUERY) ?? runIllustrativeScreener(DEFAULT_SCREENER_QUERY)
  return <MarketsScreener initialResponse={response} />
}
