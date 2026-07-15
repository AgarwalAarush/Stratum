import { ILLUSTRATIVE_MARKET_OVERVIEW } from '../../../../lib/markets/fixtures.ts'

export const CACHE_TTL_SECONDS = 60

export async function GET() {
  return Response.json(ILLUSTRATIVE_MARKET_OVERVIEW, {
    headers: {
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300, stale-if-error=86400',
      'X-Market-Feed': ILLUSTRATIVE_MARKET_OVERVIEW.feed,
    },
  })
}
