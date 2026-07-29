import { NextResponse } from 'next/server'
import { getAllowedMarketUser } from '@/lib/auth/markets-session'
import { enqueueAgentJob } from '@/lib/server/agent-jobs'
import { fetchResearchJobs } from '@/lib/server/research-jobs'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const user = await getAllowedMarketUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const url = new URL(request.url)
  const id = url.searchParams.get('id') ?? undefined
  const symbolInput = url.searchParams.get('symbol')
  const symbol = symbolInput?.trim().toUpperCase()
  if (symbol && !/^[A-Z][A-Z0-9.-]{0,11}$/.test(symbol)) {
    return NextResponse.json({ error: 'A valid symbol is required' }, { status: 400 })
  }
  const jobs = await fetchResearchJobs(user.id, { id, symbol, limit: id || symbol ? 1 : 12 })
  return NextResponse.json({ jobs }, {
    headers: { 'Cache-Control': 'private, no-store' },
  })
}

export async function POST(request: Request) {
  const user = await getAllowedMarketUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const body = await request.json() as Record<string, unknown>
    const symbol = typeof body.symbol === 'string' ? body.symbol.trim().toUpperCase() : ''
    if (!/^[A-Z][A-Z0-9.-]{0,11}$/.test(symbol)) throw new Error('A valid symbol is required')
    const refresh = body.refresh === true
    const jobType = 'generate-company-research' as const
    const dedupeKey = `${jobType}:${user.id}:${symbol}:${new Date().toISOString().slice(0, 10)}${refresh ? ':refresh' : ''}`
    if (user.id === 'local-development-user') {
      return NextResponse.json({ accepted: true, id: dedupeKey, deduplicated: false }, { status: 202 })
    }
    const job = await enqueueAgentJob(jobType, {
      ownerId: user.id,
      symbol,
      reason: refresh ? 'manual-refresh' : 'manual-promotion',
    }, dedupeKey)
    return NextResponse.json({
      accepted: true,
      ...job,
      statusUrl: `/api/markets/research?id=${job.id}`,
    }, { status: 202 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to queue research' }, { status: 400 })
  }
}
