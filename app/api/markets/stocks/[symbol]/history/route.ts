import { NextResponse } from 'next/server'
import { getAllowedMarketUser } from '@/lib/auth/markets-session'
import { fetchLatestSnapshotMeta } from '@/lib/server/markets-repository'
import { fetchOnDemandFiveYearPriceHistory } from '@/lib/server/stock-price-history'
import { buildCacheHeaders } from '@/lib/server/http-cache'

export const dynamic = 'force-dynamic'

function validSymbol(value: string): boolean {
  return /^[A-Z][A-Z0-9.-]{0,11}$/.test(value)
}

function usableAlpacaFeed(value: string | undefined): 'delayed_sip' | 'iex' | 'sip' {
  return value === 'delayed_sip' || value === 'iex' || value === 'sip' ? value : 'delayed_sip'
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
    const latestSnapshot = await fetchLatestSnapshotMeta()
    const result = await fetchOnDemandFiveYearPriceHistory(symbol, usableAlpacaFeed(latestSnapshot?.feed))
    if (!result.data) return NextResponse.json({ error: `Five-year price history is unavailable for ${symbol}` }, { status: 404 })
    return NextResponse.json(result.data, { headers: buildCacheHeaders('medium', result.source) })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load five-year price history' }, { status: 502 })
  }
}
