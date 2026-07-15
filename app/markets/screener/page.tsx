import { MarketsScreener } from '@/components/markets/MarketsScreener'
import { DEFAULT_SCREENER_QUERY, runIllustrativeScreener } from '@/lib/markets/screener'

export default function MarketsScreenerPage() {
  return <MarketsScreener initialResponse={runIllustrativeScreener(DEFAULT_SCREENER_QUERY)} />
}
