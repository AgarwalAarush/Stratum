import { requireAllowedMarketUser } from '@/lib/auth/markets-session'
import { buildMarketThesisBrief } from '@/lib/markets/thesis-brief'
import { fetchMarketThesisWorkspace } from '@/lib/server/world-memory'

export const CACHE_TTL_SECONDS = 60

export async function GET() {
  const user = await requireAllowedMarketUser()
  const workspace = await fetchMarketThesisWorkspace(user.id)
  return Response.json({ brief: buildMarketThesisBrief(workspace) }, {
    headers: { 'Cache-Control': 'private, max-age=60, stale-while-revalidate=300' },
  })
}
