import { NextRequest, NextResponse } from 'next/server'
import { getAllowedMarketUser } from '@/lib/auth/markets-session'
import { enqueueAgentJob } from '@/lib/server/agent-jobs'
import { getSupabaseClient } from '@/lib/server/supabase'
import { fetchWorldReplayStatus, startWorldReplay } from '@/lib/server/world-replay'
import { labelWorldReview, rollbackWorldPolicy, startWorldPolicyExperiment } from '@/lib/server/world-governance'
import { evaluateWorldBenchmark, labelWorldBenchmarkCase, seedWorldBenchmarkFromEventLedger } from '@/lib/server/world-benchmark'
import { WORLD_ATTENTION_ROUTES, WORLD_SPECIALIST_LENSES } from '@/lib/markets/world-attention'

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
    if (body.action === 'refresh-frontier') {
      if (typeof body.frontierId !== 'string') return NextResponse.json({ error: 'A coverage frontier is required' }, { status: 400 })
      const { error } = await supabase.from('world_coverage_frontiers').update({ next_review_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', body.frontierId)
      if (error) throw new Error(error.message)
      const job = await enqueueAgentJob('run-world-thinker', { trigger: 'manual', coverageFrontierIds: [body.frontierId] }, `run-world-thinker:frontier:${body.frontierId}:${new Date().toISOString().slice(0, 13)}`)
      return NextResponse.json({ queued: true, ...job })
    }
    if (body.action === 'resume-replay') {
      const current = await fetchWorldReplayStatus()
      const replay = current.run ?? await startWorldReplay()
      if (replay.status === 'completed') return NextResponse.json({ error: 'The latest replay is already complete' }, { status: 409 })
      await supabase.from('world_replay_runs').update({ status: 'queued', error: null, updated_at: new Date().toISOString() }).eq('id', replay.id)
      const job = await enqueueAgentJob('run-world-replay', { replayRunId: replay.id, cursorAt: replay.cursorAt, step: `resume:${Date.now()}` })
      return NextResponse.json({ queued: true, replayRunId: replay.id, ...job })
    }
    if (body.action === 'retry-replay-batch') {
      if (typeof body.batchId !== 'string') return NextResponse.json({ error: 'A replay batch is required' }, { status: 400 })
      const { data: batch, error } = await supabase.from('world_replay_batches').select('replay_run_id,week_start').eq('id', body.batchId).maybeSingle()
      if (error || !batch) return NextResponse.json({ error: error?.message ?? 'Replay batch not found' }, { status: 404 })
      await supabase.from('world_replay_runs').update({ status: 'queued', cursor_at: batch.week_start, error: null, updated_at: new Date().toISOString() }).eq('id', batch.replay_run_id)
      const job = await enqueueAgentJob('run-world-replay', { replayRunId: batch.replay_run_id, cursorAt: batch.week_start, step: `retry:${Date.now()}` })
      return NextResponse.json({ queued: true, ...job })
    }
    if (body.action === 'retry-quarantined-event') {
      if (typeof body.eventClusterId !== 'string') return NextResponse.json({ error: 'An event cluster is required' }, { status: 400 })
      const { error } = await supabase.from('world_event_clusters').update({ processing_state: 'pending', processing_attempts: 0, processing_error: null, quarantined_at: null, next_attempt_at: null, updated_at: new Date().toISOString() }).eq('id', body.eventClusterId).eq('processing_state', 'quarantined')
      if (error) throw new Error(error.message)
      const job = await enqueueAgentJob('run-world-thinker', { trigger: 'urgent', eventClusterIds: [body.eventClusterId] }, `run-world-thinker:retry:${body.eventClusterId}:${new Date().toISOString()}`)
      return NextResponse.json({ queued: true, ...job })
    }
    if (body.action === 'label-review') {
      const categories = ['suspected_miss', 'false_positive', 'promoted_change', 'compound_link', 'coverage_problem']
      const subjectTypes = ['event', 'signal', 'node', 'link', 'source', 'policy']
      const labels = ['important', 'not_important', 'correct', 'incorrect', 'useful', 'not_useful', 'needs_followup']
      if (typeof body.category !== 'string' || !categories.includes(body.category) || typeof body.subjectType !== 'string' || !subjectTypes.includes(body.subjectType) || typeof body.subjectId !== 'string' || typeof body.label !== 'string' || !labels.includes(body.label)) return NextResponse.json({ error: 'A valid World review label is required' }, { status: 400 })
      await labelWorldReview({ ownerId: user.id, category: body.category as Parameters<typeof labelWorldReview>[0]['category'], subjectType: body.subjectType as Parameters<typeof labelWorldReview>[0]['subjectType'], subjectId: body.subjectId, label: body.label, notes: typeof body.notes === 'string' ? body.notes : undefined })
      return NextResponse.json({ labeled: true })
    }
    if (body.action === 'seed-benchmark') return NextResponse.json({ seeded: true, ...await seedWorldBenchmarkFromEventLedger() })
    if (body.action === 'evaluate-benchmark') return NextResponse.json({ evaluated: true, ...await evaluateWorldBenchmark() })
    if (body.action === 'label-benchmark') {
      if (typeof body.caseId !== 'string' || (body.status !== 'confirmed' && body.status !== 'rejected')) return NextResponse.json({ error: 'A benchmark case and status are required' }, { status: 400 })
      if (body.status === 'confirmed' && (typeof body.expectedRoute !== 'string' || !WORLD_ATTENTION_ROUTES.includes(body.expectedRoute as never))) return NextResponse.json({ error: 'A confirmed benchmark case requires a valid expected route' }, { status: 400 })
      if (body.expectedPrimaryLens != null && (typeof body.expectedPrimaryLens !== 'string' || !WORLD_SPECIALIST_LENSES.includes(body.expectedPrimaryLens as never))) return NextResponse.json({ error: 'The expected specialist lens is invalid' }, { status: 400 })
      await labelWorldBenchmarkCase({ caseId: body.caseId, ownerId: user.id, status: body.status, expectedRoute: body.expectedRoute as never, expectedPrimaryLens: body.expectedPrimaryLens as never, notes: typeof body.notes === 'string' ? body.notes : undefined })
      return NextResponse.json({ labeled: true })
    }
    if (body.action === 'start-policy-experiment') {
      const changes = body.changes && typeof body.changes === 'object' ? body.changes as Parameters<typeof startWorldPolicyExperiment>[0] : {}
      return NextResponse.json({ started: true, ...await startWorldPolicyExperiment(changes, user.id) })
    }
    if (body.action === 'rollback-policy') {
      if (typeof body.version !== 'string') return NextResponse.json({ error: 'A policy version is required' }, { status: 400 })
      await rollbackWorldPolicy(body.version)
      return NextResponse.json({ rolledBack: true })
    }
    return NextResponse.json({ error: 'Unsupported World Thinker action' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to update the World Thinker' }, { status: 500 })
  }
}
