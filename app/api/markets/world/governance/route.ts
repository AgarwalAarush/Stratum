import { NextResponse } from 'next/server'
import { getAllowedMarketUser } from '@/lib/auth/markets-session'
import { fetchWorldGovernanceSnapshot } from '@/lib/server/world-governance'

export const dynamic = 'force-dynamic'

export async function GET() {
  const user = await getAllowedMarketUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try { return NextResponse.json(await fetchWorldGovernanceSnapshot()) }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load World governance' }, { status: 500 }) }
}
