import { NextRequest, NextResponse } from 'next/server'
import { getAllowedMarketUser } from '@/lib/auth/markets-session'
import { enqueueAgentJob } from '@/lib/server/agent-jobs'
import {
  approveWorldSource,
  activateMarketDomainPack,
  blockWorldSource,
  fetchWorldSourceControlWorkspace,
  reviseWorldSourceCanonicalUrl,
  validateWorldSourceContract,
} from '@/lib/server/world-source-control'
import { reviewWorldObservationProposal } from '@/lib/server/world-observation-review'
import { reviewWorldSourceReferral } from '@/lib/server/intelligence-source-referrals'

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
    if (body.action === 'audit-health') {
      const queued = await enqueueAgentJob('verify-world-source-health', { trigger: 'manual' })
      return NextResponse.json({ queued: true, ...queued })
    }
    if (body.action === 'orchestrate-market-research') {
      const queued = await enqueueAgentJob('orchestrate-market-research', { trigger: 'manual' })
      return NextResponse.json({ queued: true, ...queued })
    }
    if (body.action === 'scan-intelligence-source-referrals') {
      const queued = await enqueueAgentJob('scan-intelligence-source-referrals', { trigger: 'manual' })
      return NextResponse.json({ queued: true, ...queued })
    }
    if (body.action === 'review-source-referral') {
      if (typeof body.referralId !== 'string' || (body.decision !== 'register' && body.decision !== 'dismiss') || typeof body.rationale !== 'string') {
        return NextResponse.json({ error: 'A referral, explicit decision, and review rationale are required.' }, { status: 400 })
      }
      const review = await reviewWorldSourceReferral({
        referralId: body.referralId, reviewerId: user.id, decision: body.decision, rationale: body.rationale,
      })
      const preflight = review.sourceSlug
        ? await enqueueAgentJob('preflight-world-source-candidate', { slug: review.sourceSlug, trigger: 'feed-referral-review' })
        : null
      return NextResponse.json({ review, preflightQueued: preflight ? !preflight.deduplicated : false })
    }
    if (body.action === 'auto-accept-observation-proposals') {
      // Quote re-verification reads STRATUM_DATA_ROOT extracts on the worker.
      // Do not run acceptance on Vercel where the private corpus is absent.
      const queued = await enqueueAgentJob('auto-accept-observation-proposals', {
        trigger: 'manual',
        domainId: typeof body.domainId === 'string' ? body.domainId : undefined,
        limit: typeof body.limit === 'number' ? body.limit : 40,
      })
      return NextResponse.json({ queued: true, ...queued })
    }
    if (body.action === 'preflight-candidate') {
      if (typeof body.slug !== 'string' || !body.slug.trim()) return NextResponse.json({ error: 'A candidate source is required.' }, { status: 400 })
      const queued = await enqueueAgentJob('preflight-world-source-candidate', { slug: body.slug.trim().toLowerCase(), trigger: 'manual' })
      return NextResponse.json({ queued: true, ...queued })
    }
    if (body.action === 'scout') {
      if (typeof body.domainId !== 'string' || typeof body.reason !== 'string' || !body.reason.trim()) {
        return NextResponse.json({ error: 'A domain and source-coverage reason are required.' }, { status: 400 })
      }
      const queued = await enqueueAgentJob('scout-world-sources', { domainId: body.domainId, reason: body.reason.trim(), trigger: 'manual' })
      return NextResponse.json({ queued: true, ...queued })
    }
    if (body.action === 'scout-broad-research') {
      if (typeof body.domainId !== 'string' || typeof body.reason !== 'string' || !body.reason.trim()) {
        return NextResponse.json({ error: 'A domain and research question are required.' }, { status: 400 })
      }
      const queued = await enqueueAgentJob('scout-market-research', { domainId: body.domainId, reason: body.reason.trim(), trigger: 'manual' })
      return NextResponse.json({ queued: true, ...queued })
    }
    if (body.action === 'approve') {
      if (typeof body.slug !== 'string' || typeof body.reason !== 'string') return NextResponse.json({ error: 'A source slug and approval reason are required.' }, { status: 400 })
      const source = await approveWorldSource(body.slug, validateWorldSourceContract(body.contract), body.reason)
      const collection = await enqueueAgentJob('collect-world-source-documents', {
        trigger: 'source-approval', sourceSlug: source.slug,
      })
      return NextResponse.json({ source, initialCaptureQueued: !collection.deduplicated })
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
    if (body.action === 'review-observation-proposal') {
      if (typeof body.proposalId !== 'string' || (body.decision !== 'accepted' && body.decision !== 'rejected') || typeof body.rationale !== 'string') {
        return NextResponse.json({ error: 'A proposal, explicit decision, and review rationale are required.' }, { status: 400 })
      }
      const review = await reviewWorldObservationProposal({ proposalId: body.proposalId, reviewerId: user.id, decision: body.decision, rationale: body.rationale })
      const queued = review.decision === 'accepted' && review.observationId
        ? await enqueueAgentJob('synthesize-market-hypotheses', {
          reason: `accepted observation:${review.observationId}`,
          evidenceFingerprint: review.observationId,
        })
        : null
      return NextResponse.json({ review, analysisQueued: queued ? !queued.deduplicated : false })
    }
    if (body.action === 'revise-canonical-url') {
      if (typeof body.slug !== 'string' || typeof body.canonicalUrl !== 'string' || typeof body.rationale !== 'string') {
        return NextResponse.json({ error: 'A source, canonical URL, and revision rationale are required.' }, { status: 400 })
      }
      const source = await reviseWorldSourceCanonicalUrl({ slug: body.slug, canonicalUrl: body.canonicalUrl, rationale: body.rationale, reviewerId: user.id })
      return NextResponse.json({ source })
    }
    return NextResponse.json({ error: 'Unsupported source-control action.' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to update source control' }, { status: 500 })
  }
}
