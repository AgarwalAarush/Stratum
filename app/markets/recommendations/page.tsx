import { requireAllowedMarketUser } from '@/lib/auth/markets-session'
import { fetchRecommendationWorkspace } from '@/lib/server/recommendations'
import { RecommendationsWorkspace } from '@/components/markets/RecommendationsWorkspace'
export const dynamic = 'force-dynamic'
export default async function RecommendationsPage() {
  const user = await requireAllowedMarketUser()
  const result = await fetchRecommendationWorkspace(user.id).catch(() => null)
  return <RecommendationsWorkspace initialData={result} />
}
