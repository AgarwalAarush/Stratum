import { NextResponse } from 'next/server'
import { getAllowedMarketUser } from '@/lib/auth/markets-session'
import { fetchResearchOperations } from '@/lib/server/research-rollout'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const user = await getAllowedMarketUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const requiredRelease = new URL(request.url).searchParams.get('requiredRelease')
  if (requiredRelease && !/^[0-9a-f]{40}$/i.test(requiredRelease)) return NextResponse.json({ error: 'Provide an exact worker release SHA' }, { status: 400 })
  const operations = await fetchResearchOperations(user.id, { requiredRelease })
  return NextResponse.json(operations, { headers: { 'Cache-Control': 'private, no-store' } })
}
