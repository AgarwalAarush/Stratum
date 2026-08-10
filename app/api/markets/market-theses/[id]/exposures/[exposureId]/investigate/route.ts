import { NextResponse } from 'next/server'
import { getAllowedMarketUser } from '@/lib/auth/markets-session'
import { enqueueAgentJob } from '@/lib/server/agent-jobs'
import { resolveMarketThesisExposureInvestigation } from '@/lib/server/theses'

export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; exposureId: string }> },
) {
  const user = await getAllowedMarketUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const { id: hypothesisId, exposureId } = await params
    const body = await request.json() as { marketThesisVersionId?: unknown }
    const marketThesisVersionId = typeof body.marketThesisVersionId === 'string'
      ? body.marketThesisVersionId.trim()
      : ''
    if (!marketThesisVersionId) return NextResponse.json({ error: 'A market thesis version is required' }, { status: 400 })
    if (user.id === 'local-development-user') {
      return NextResponse.json({ queued: true, deduplicated: false, symbol: 'LOCAL', jobId: crypto.randomUUID() })
    }
    const exposure = await resolveMarketThesisExposureInvestigation(
      user.id,
      hypothesisId,
      marketThesisVersionId,
      exposureId,
    )
    const day = new Date().toISOString().slice(0, 10)
    const job = await enqueueAgentJob('generate-company-research', {
      ownerId: user.id,
      symbol: exposure.symbol,
      reason: `market-thesis-exposure:${marketThesisVersionId}:${exposureId}`,
      marketThesisVersionId,
      marketThesisExposureId: exposureId,
    }, `generate-company-research:market-thesis-exposure:${user.id}:${marketThesisVersionId}:${exposureId}:${day}`)
    return NextResponse.json({ queued: true, deduplicated: job.deduplicated, symbol: exposure.symbol, jobId: job.id })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to queue company research' }, { status: 400 })
  }
}
