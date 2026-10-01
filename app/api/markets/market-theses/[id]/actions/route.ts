import { NextResponse } from 'next/server'
import { getAllowedMarketUser } from '@/lib/auth/markets-session'
import { enqueueAgentJob } from '@/lib/server/agent-jobs'
import { fetchMarketThesisDetail } from '@/lib/server/world-memory'

export const dynamic = 'force-dynamic'

const ACTIONS = ['freeze', 'reject', 'archive', 'reactivate', 'request_deepening'] as const
type MarketThesisAction = typeof ACTIONS[number]

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAllowedMarketUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const { id } = await params
    const body = await request.json() as { action?: unknown }
    const action = typeof body.action === 'string' && ACTIONS.includes(body.action as MarketThesisAction)
      ? body.action as MarketThesisAction
      : null
    if (!action) return NextResponse.json({ error: 'Unsupported market thesis action' }, { status: 400 })
    if (action === 'request_deepening') {
      const legacy = await fetchMarketThesisDetail(user.id,id)
      if (!legacy) return NextResponse.json({error:'Unknown legacy hypothesis'}, {status:404})
      const job = await enqueueAgentJob('run-world-thinker', {
        trigger: 'manual', legacyHypothesisId: id,
        ownerId: user.id,
        hypothesisId: id,
        reason: 'user-requested deepening',
      })
      return NextResponse.json({ queued: true, jobId: job.id })
    }
    return NextResponse.json({ error: 'Legacy beliefs are preserved as read-only history. Review their imported World node to change the current belief.' }, {status:409})
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to update market thesis' }, { status: 400 })
  }
}
