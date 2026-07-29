import { NextResponse } from 'next/server'
import { getAllowedMarketUser } from '@/lib/auth/supabase-server'
import { enqueueAgentJob } from '@/lib/server/agent-jobs'

export const dynamic = 'force-dynamic'

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
    return NextResponse.json({ accepted: true, ...job }, { status: 202 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to queue research' }, { status: 400 })
  }
}
