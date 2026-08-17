import { fetchMarketBriefNews } from '@/lib/server/market-brief-news'

export const CACHE_TTL_SECONDS = 300

function symbolsFromRequest(request: Request): string[] {
  return [...new Set((new URL(request.url).searchParams.get('symbols') ?? '')
    .split(',')
    .map((symbol) => symbol.trim().toUpperCase())
    .filter((symbol) => /^[A-Z][A-Z0-9.-]{0,11}$/.test(symbol)))]
    .slice(0, 12)
}

export async function GET(request: Request) {
  const items = await fetchMarketBriefNews(symbolsFromRequest(request))
  return Response.json({ items }, {
    headers: {
      // The route is authenticated. Browser caching prevents the same page
      // visit from re-requesting a feed that is already shared-server cached.
      'Cache-Control': 'private, max-age=300, stale-while-revalidate=900',
    },
  })
}
