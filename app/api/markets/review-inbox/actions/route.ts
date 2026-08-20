import { NextRequest, NextResponse } from 'next/server'
import { getAllowedMarketUser } from '@/lib/auth/markets-session'
import { decideOwnerReviewItem } from '@/lib/server/causal-model'

const STATUSES = ['in_review', 'investigate', 'accepted', 'rejected', 'no_trade', 'revised', 'deferred'] as const

export async function POST(request: NextRequest) {
  const user = await getAllowedMarketUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const body = await request.json() as Record<string, unknown>
    if (typeof body.itemId !== 'string' || !STATUSES.includes(body.status as typeof STATUSES[number])) {
      return NextResponse.json({ error: 'A review item and valid decision are required' }, { status: 400 })
    }
    const item = await decideOwnerReviewItem({
      id: body.itemId, ownerId: user.id, status: body.status as typeof STATUSES[number],
      rationale: typeof body.rationale === 'string' ? body.rationale : undefined,
    })
    return NextResponse.json({ item })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to update review item' }, { status: 500 })
  }
}
