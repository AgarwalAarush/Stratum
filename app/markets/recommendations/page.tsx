import { requireAllowedMarketUser } from '@/lib/auth/markets-session'
import { fetchRecommendationActions } from '@/lib/server/recommendation-reads'
import { RecommendationsWorkspace } from '@/components/markets/RecommendationsWorkspace'
export const dynamic = 'force-dynamic'
export default async function RecommendationsPage() {
  const user = await requireAllowedMarketUser()
  const result = await fetchRecommendationActions(user.id).catch(() => null)
  return <RecommendationsWorkspace initialData={result} />
}
