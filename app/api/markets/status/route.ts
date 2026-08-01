import { fetchLatestSnapshotMeta } from '../../../../lib/server/markets-repository.ts'

export const CACHE_TTL_SECONDS = 10

export async function GET() {
  const snapshot = await fetchLatestSnapshotMeta()
  return Response.json({
    dataAsOf: snapshot?.data_as_of ?? null,
    feed: snapshot?.feed ?? null,
  }, {
    headers: {
      // The proxy protects this route. A short browser cache avoids repeating
      // the non-critical header read during quick client-side navigation.
      'Cache-Control': 'private, max-age=10, stale-while-revalidate=50',
    },
  })
}
