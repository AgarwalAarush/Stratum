import { NextRequest, NextResponse } from 'next/server'
import { getAllowedMarketUser } from '@/lib/auth/markets-session'
import { fetchWorldRuns } from '@/lib/server/world-projection'
import { fetchWorldReplayStatus } from '@/lib/server/world-replay'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const user = await getAllowedMarketUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const limit = Number(new URL(request.url).searchParams.get('limit') ?? 40)
  try {
    const [runs, replay] = await Promise.all([fetchWorldRuns(Number.isFinite(limit) ? limit : 40), fetchWorldReplayStatus()])
    return NextResponse.json({ runs, replay }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load World Thinker runs' }, { status: 500 })
  }
}
