import { NextRequest, NextResponse } from 'next/server'
import { getAllowedMarketUser } from '@/lib/auth/markets-session'
import { enqueueAgentJob } from '@/lib/server/agent-jobs'
import { getSupabaseClient } from '@/lib/server/supabase'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const user = await getAllowedMarketUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const body = await request.json() as Record<string, unknown>
    if (body.action === 'manual-refresh') {
      const job = await enqueueAgentJob('refresh-world-events', { trigger: 'manual', runThinkerAfter: true })
      return NextResponse.json({ queued: true, ...job })
    }
    const supabase = getSupabaseClient()
    if (!supabase) return NextResponse.json({ error: 'Supabase is not configured' }, { status: 503 })
    if (body.action === 'investigate-lead') {
      if (typeof body.leadId !== 'string') return NextResponse.json({ error: 'A lead ID is required' }, { status: 400 })
      const { data: lead, error } = await supabase.from('world_opportunity_leads').select('*').eq('id', body.leadId).maybeSingle()
      if (error || !lead) return NextResponse.json({ error: error?.message ?? 'Lead not found' }, { status: 404 })
      if (lead.status === 'dismissed') return NextResponse.json({ error: 'Dismissed leads must be restored before investigation' }, { status: 409 })
      const job = await enqueueAgentJob('generate-company-research', {
        ownerId: user.id, symbol: lead.symbol, reason: `owner-investigation:${lead.id}`, worldOpportunityLeadId: lead.id,
        originatingWorldCommit: lead.world_commit, originatingWorldNodeId: lead.originating_node_id, originatingWorldHypothesisId: lead.originating_hypothesis_id,
      }, `generate-company-research:world-opportunity:${lead.id}`)
      await supabase.from('world_opportunity_leads').update({ status: 'queued', research_job_id: job.id, investigated_by: user.id, updated_at: new Date().toISOString() }).eq('id', lead.id)
      return NextResponse.json({ queued: true, ...job })
    }
    if (body.action === 'dismiss-lead') {
      if (typeof body.leadId !== 'string' || typeof body.reason !== 'string' || body.reason.trim().length < 3) return NextResponse.json({ error: 'A lead and dismissal reason are required' }, { status: 400 })
      const { error } = await supabase.from('world_opportunity_leads').update({ status: 'dismissed', dismissal_reason: body.reason.trim().slice(0, 1_000), investigated_by: user.id, updated_at: new Date().toISOString() }).eq('id', body.leadId).in('status', ['new', 'researched'])
      if (error) throw new Error(error.message)
      return NextResponse.json({ dismissed: true })
    }
    if (body.action === 'retry-projection') {
      const { data: run } = await supabase.from('world_thinker_runs').select('result_commit').eq('projection_status', 'failed').not('result_commit', 'is', null).order('started_at', { ascending: false }).limit(1).maybeSingle()
      if (!run?.result_commit) return NextResponse.json({ error: 'No failed projection is available to retry' }, { status: 404 })
      const job = await enqueueAgentJob('project-world-repository', { commit: run.result_commit })
      return NextResponse.json({ queued: true, ...job })
    }
    return NextResponse.json({ error: 'Unsupported World Thinker action' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to update the World Thinker' }, { status: 500 })
  }
}
