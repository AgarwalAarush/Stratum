import { fetchScopeFeedPayload } from '../../../../lib/server/scope-feed.ts'

export const CACHE_TTL_SECONDS = 60

export async function GET(_request: Request, { params }: { params: Promise<{ scope: string }> }) {
  const { scope } = await params
  const payload = await fetchScopeFeedPayload(scope)
  if (!payload) return Response.json({ error: 'Unknown scope' }, { status: 404 })
  return Response.json(payload, {
    headers: {
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300, stale-if-error=900',
    },
  })
}
