import { requireAllowedMarketUser } from '@/lib/auth/markets-session'
import { fetchMarketEvents } from '@/lib/server/market-events'
import { fetchPortfolioEventSymbols } from '@/lib/server/portfolio'

export const CACHE_TTL_SECONDS = 300

function requestedSymbol(request: Request): string | null {
  const symbol = (new URL(request.url).searchParams.get('symbol') ?? '').trim().toUpperCase()
  return /^[A-Z][A-Z0-9.-]{0,11}$/.test(symbol) ? symbol : null
}

export async function GET(request: Request) {
  const user = await requireAllowedMarketUser()
  const [portfolioSymbols, symbol] = await Promise.all([
    fetchPortfolioEventSymbols(user.id),
    Promise.resolve(requestedSymbol(request)),
  ])
  const items = await fetchMarketEvents(symbol ? [symbol, ...portfolioSymbols] : portfolioSymbols)
  return Response.json({ items }, {
    headers: { 'Cache-Control': 'private, max-age=300, stale-while-revalidate=900' },
  })
}
