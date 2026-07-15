import { parseScreenerQuery, runIllustrativeScreener, ScreenerValidationError } from '../../../../lib/markets/screener.ts'
import { fetchLatestScreener } from '../../../../lib/server/markets-repository.ts'

export const CACHE_TTL_SECONDS = 60

export async function POST(request: Request) {
  try {
    const query = parseScreenerQuery(await request.json())
    const response = await fetchLatestScreener(query) ?? runIllustrativeScreener(query)

    return Response.json(response, {
      headers: {
        'Cache-Control': 'private, no-store',
        'X-Market-Feed': response.feed,
      },
    })
  } catch (error) {
    const message = error instanceof ScreenerValidationError ? error.message : 'Invalid JSON request body'
    return Response.json({ error: { code: 'INVALID_SCREENER_QUERY', message } }, { status: 400 })
  }
}
