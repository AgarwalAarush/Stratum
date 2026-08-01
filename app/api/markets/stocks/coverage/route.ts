import { NextResponse } from 'next/server'
import { getAllowedMarketUser } from '@/lib/auth/markets-session'
import { enqueueAgentJob } from '@/lib/server/agent-jobs'
import { requestMarketCoverage } from '@/lib/server/market-universe'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const user = await getAllowedMarketUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const body = await request.json() as Record<string, unknown>
    const symbol = typeof body.symbol === 'string' ? body.symbol.trim().toUpperCase() : ''
    if (!/^[A-Z][A-Z0-9.-]{0,11}$/.test(symbol)) {
      return NextResponse.json({ error: 'A valid stock symbol is required' }, { status: 400 })
    }
    if (user.id === 'local-development-user') return NextResponse.json({ registered: true, symbol })
    const registered = await requestMarketCoverage(symbol)
    if (!registered) return NextResponse.json({ error: `${symbol} is not an active tradable U.S. equity` }, { status: 404 })
    const job = await enqueueAgentJob('refresh-market-screener', {
      mode: 'coverage',
      symbol,
    })
    return NextResponse.json({ registered: true, symbol, jobId: job.id, deduplicated: job.deduplicated })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to request market coverage' }, { status: 400 })
  }
}
