import { ILLUSTRATIVE_MARKET_OVERVIEW } from '../../../../lib/markets/fixtures.ts'
import { fetchLatestMarketOverview } from '../../../../lib/server/markets-repository.ts'

export const CACHE_TTL_SECONDS = 60

export async function GET() {
  const overview = await fetchLatestMarketOverview() ?? ILLUSTRATIVE_MARKET_OVERVIEW
  return Response.json(overview, {
    headers: {
      'Cache-Control': 'private, no-store',
      'X-Market-Feed': overview.feed,
    },
  })
}
