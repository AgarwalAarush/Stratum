import { searchLatestStocks } from '../../../../../lib/server/stock-search.ts'

export const CACHE_TTL_SECONDS = 60

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get('q') ?? ''
  const response = await searchLatestStocks(query)
  return Response.json(response ?? { results: [], feed: null, dataAsOf: null, stale: true }, {
    headers: { 'Cache-Control': 'private, no-store' },
  })
}
