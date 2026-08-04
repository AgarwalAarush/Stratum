import { NextRequest, NextResponse } from 'next/server'
import { getAllowedMarketUser } from '@/lib/auth/markets-session'
import { enqueueAgentJob } from '@/lib/server/agent-jobs'
import {
  approveWorldSource,
  activateMarketDomainPack,
  blockWorldSource,
  fetchWorldSourceControlWorkspace,
  validateWorldSourceContract,
} from '@/lib/server/world-source-control'

export const dynamic = 'force-dynamic'

export async function GET() {
  const user = await getAllowedMarketUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    return NextResponse.json(await fetchWorldSourceControlWorkspace())
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load source control' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const user = await getAllowedMarketUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const body = await request.json() as Record<string, unknown>
    if (body.action === 'scout') {
      if (typeof body.domainId !== 'string' || typeof body.reason !== 'string' || !body.reason.trim()) {
        return NextResponse.json({ error: 'A domain and source-coverage reason are required.' }, { status: 400 })
      }
      const queued = await enqueueAgentJob('scout-world-sources', { domainId: body.domainId, reason: body.reason.trim(), trigger: 'manual' })
      return NextResponse.json({ queued: true, ...queued })
    }
    if (body.action === 'approve') {
      if (typeof body.slug !== 'string' || typeof body.reason !== 'string') return NextResponse.json({ error: 'A source slug and approval reason are required.' }, { status: 400 })
      const source = await approveWorldSource(body.slug, validateWorldSourceContract(body.contract), body.reason)
      return NextResponse.json({ source })
    }
    if (body.action === 'block') {
      if (typeof body.slug !== 'string' || typeof body.reason !== 'string') return NextResponse.json({ error: 'A source slug and block reason are required.' }, { status: 400 })
      await blockWorldSource(body.slug, body.reason)
      return NextResponse.json({ blocked: true })
    }
    if (body.action === 'activate-domain') {
      if (typeof body.domainId !== 'string' || typeof body.reason !== 'string') return NextResponse.json({ error: 'A domain and activation reason are required.' }, { status: 400 })
      const event = await activateMarketDomainPack(body.domainId, body.reason)
      return NextResponse.json({ event })
    }
    return NextResponse.json({ error: 'Unsupported source-control action.' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to update source control' }, { status: 500 })
  }
}
