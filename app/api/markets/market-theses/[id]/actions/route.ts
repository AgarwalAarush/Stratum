import { NextResponse } from 'next/server'
import { getAllowedMarketUser } from '@/lib/auth/markets-session'
import { enqueueAgentJob } from '@/lib/server/agent-jobs'
import { setMarketThesisAction } from '@/lib/server/world-memory'

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
      const job = await enqueueAgentJob('synthesize-market-hypotheses', {
        ownerId: user.id,
        hypothesisId: id,
        requestedBy: 'user',
      }, `synthesize-market-hypotheses:deepening:${user.id}:${id}:${new Date().toISOString().slice(0, 10)}`)
      return NextResponse.json({ queued: true, jobId: job.id })
    }
    if (user.id !== 'local-development-user') await setMarketThesisAction(user.id, id, action)
    return NextResponse.json({ success: true, action })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to update market thesis' }, { status: 400 })
  }
}
