import { NextResponse } from 'next/server'
import { getAllowedMarketUser } from '@/lib/auth/markets-session'
import { enqueueAgentJob } from '@/lib/server/agent-jobs'
import { loadOnDemandFiveYearPriceHistory } from '@/lib/server/stock-price-history'
import { buildCacheHeaders } from '@/lib/server/http-cache'

export const dynamic = 'force-dynamic'

function validSymbol(value: string): boolean {
  return /^[A-Z][A-Z0-9.-]{0,11}$/.test(value)
}

export async function GET(request: Request, { params }: { params: Promise<{ symbol: string }> }) {
  const user = await getAllowedMarketUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { symbol: rawSymbol } = await params
  const symbol = rawSymbol.trim().toUpperCase()
  if (!validSymbol(symbol)) return NextResponse.json({ error: 'A valid stock symbol is required' }, { status: 400 })
  if (new URL(request.url).searchParams.get('period') !== '5y') {
    return NextResponse.json({ error: 'Only the five-year history period is supported' }, { status: 400 })
  }

  try {
    const result = await loadOnDemandFiveYearPriceHistory(symbol)
    if (!result.data) {
      const job = await enqueueAgentJob('fetch-stock-price-history', { symbol })
      return NextResponse.json({
        status: 'queued',
        symbol,
        jobId: job.id,
        retryAfterMs: 1_500,
      }, { status: 202, headers: { 'Cache-Control': 'no-store' } })
    }
    return NextResponse.json(result.data, { headers: buildCacheHeaders('medium', result.source) })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load five-year price history' }, { status: 502 })
  }
}
