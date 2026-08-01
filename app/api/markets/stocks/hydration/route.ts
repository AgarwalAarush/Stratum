import { NextResponse } from 'next/server'
import { getAllowedMarketUser } from '@/lib/auth/markets-session'
import { enqueueAgentJob } from '@/lib/server/agent-jobs'
import { requestMarketCoverage } from '@/lib/server/market-universe'

export const dynamic = 'force-dynamic'

function validSymbol(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Z][A-Z0-9.-]{0,11}$/.test(value)
}

export async function POST(request: Request) {
  const user = await getAllowedMarketUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const body = await request.json() as Record<string, unknown>
    const symbol = typeof body.symbol === 'string' ? body.symbol.trim().toUpperCase() : ''
    if (!validSymbol(symbol)) return NextResponse.json({ error: 'A valid stock symbol is required' }, { status: 400 })
    const technical = body.technical === true
    const fundamentals = body.fundamentals === true
    if (!technical && !fundamentals) return NextResponse.json({ accepted: false, symbol })
    if (user.id === 'local-development-user') return NextResponse.json({ accepted: true, symbol })

    let technicalJobId: string | null = null
    let fundamentalsJobId: string | null = null
    if (technical) {
      const registered = await requestMarketCoverage(symbol)
      if (!registered) return NextResponse.json({ error: `${symbol} is not an active tradable U.S. equity` }, { status: 404 })
      const job = await enqueueAgentJob('refresh-market-screener', {
        mode: 'coverage',
        symbol,
        ...(fundamentals ? { hydratePacketOwnerId: user.id } : {}),
      })
      technicalJobId = job.id
    }
    if (fundamentals && !technical) {
      const job = await enqueueAgentJob('refresh-company-packet', {
        ownerId: user.id,
        symbol,
        reason: 'stock-open-hydration',
      })
      fundamentalsJobId = job.id
    }
    return NextResponse.json({ accepted: true, symbol, technicalJobId, fundamentalsJobId }, { status: 202 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to hydrate stock data' }, { status: 400 })
  }
}
