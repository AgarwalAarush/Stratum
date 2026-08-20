import { NextResponse } from 'next/server'
import { getAllowedMarketUser } from '@/lib/auth/markets-session'
import { fetchBiotechWorkspace } from '@/lib/server/biotech-catalysts'

export const dynamic = 'force-dynamic'
export const CACHE_TTL_SECONDS = 0

export async function GET() {
  const user = await getAllowedMarketUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    return NextResponse.json(await fetchBiotechWorkspace(), { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load biotech intelligence' }, { status: 500 })
  }
}
