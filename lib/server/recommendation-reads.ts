import { FORECAST_RESOLUTION_POLICY } from '../markets/forecast-metrics.ts'
import { getSupabaseClient } from './supabase.ts'
import { forecastsAreApproved } from '../markets/forecast-review.ts'
import type { DecisionContext, Recommendation } from '../markets/recommendations.ts'
import { frozenDecisionMemo } from '../markets/recommendation-memo.ts'
import { AsyncTtlCache } from './async-ttl-cache.ts'

type Row = Record<string, unknown>
type SourceReference = Pick<DecisionContext['evidence'][number], 'id' | 'url' | 'asOf' | 'availableAt'>

/** Newspaper reads only an accepted edition and its frozen source ledger.
 * No jobs, delivery/outbox, drafts, owner events, or generation are involved. */
export async function fetchPublishedNewspaperAnalysis(ownerId: string) {
  const client = database()
  const signal = AbortSignal.timeout(10_000)
  const batch = await client.from('recommendation_batches')
    .select('id,manifest_id,decision_date,published_at,summary')
    .eq('owner_id', ownerId).not('published_at', 'is', null)
    .order('published_at', { ascending: false }).order('id').limit(1)
    .abortSignal(signal).maybeSingle()
  if (batch.error) throw new Error('Unable to read published edition')
  if (!batch.data) return null
  const [versions, manifest] = await Promise.all([
    client.from('recommendation_versions').select('id,content')
      .eq('owner_id', ownerId).eq('batch_id', batch.data.id)
      .order('symbol').order('id').limit(1_000).abortSignal(signal),
    client.from('recommendation_input_manifests')
      .select('cutoff:content->cutoff,policy:content->policy,gaps:content->gaps,evidence:content->evidence')
      .eq('owner_id', ownerId).eq('id', batch.data.manifest_id)
      .abortSignal(signal).single(),
  ])
  if (versions.error || manifest.error) throw new Error('Unable to read published evidence')
  // Refuse a potentially truncated PostgREST result instead of publishing
  // partial advice as a complete edition.
  if ((versions.data?.length ?? 0) >= 1_000) throw new Error('Published edition exceeds export bound')
  return { batch: batch.data, versions: versions.data ?? [], manifest: manifest.data }
}
const evidenceCache = new AsyncTtlCache<{evidence:SourceReference[]; memos:ReturnType<typeof frozenDecisionMemo>}>({ maxEntries: 16 })
function database() {
  const client = getSupabaseClient()
  if (!client) throw new Error('Recommendations unavailable')
  return client
}

export async function fetchRecommendationActions(ownerId: string) {
  const client = database()
  const signal = AbortSignal.timeout(8_000)
  const [accounts, batch, jobs] = await Promise.all([
    client.from('portfolios').select('id,name,kind').eq('owner_id', ownerId).abortSignal(signal),
    client.from('recommendation_batches').select('id,manifest_id,decision_date,published_at,summary')
      .eq('owner_id', ownerId).order('published_at', { ascending: false }).limit(1).abortSignal(signal).maybeSingle(),
    client.from('agent_jobs').select('status,payload').eq('job_type','generate-daily-recommendations')
      .or(`payload->>ownerId.eq.${ownerId},payload->>ownerId.is.null`)
      .in('status',['queued','running']).order('created_at',{ascending:false}).limit(30).abortSignal(signal),
  ])
  if (accounts.error || batch.error) throw new Error('Unable to load the latest assessment')
  const pending = (jobs.data ?? []).find(job => {
    const payload = job.payload as Row
    return !payload.ownerId || payload.ownerId === ownerId
  })
  const preparation = pending ? {status:pending.status,waitingFor:Array.isArray((pending.payload as Row).dependencyJobIds)
    ? ((pending.payload as Row).dependencyJobIds as unknown[]).length : 0} : null
  const latest = batch.data
  if (!latest) return { viewedAt: new Date().toISOString(), accounts: accounts.data ?? [], latest: null, recommendations: [], context: null, preparation }
  const [decisions, manifest] = await Promise.all([
    client.from('recommendation_versions').select('id,content').eq('owner_id', ownerId)
      .eq('batch_id', latest.id).order('symbol').abortSignal(signal),
    client.from('recommendation_input_manifests').select('cutoff:content->cutoff,policy:content->policy,gaps:content->gaps')
      .eq('owner_id', ownerId).eq('id', latest.manifest_id).abortSignal(signal).single(),
  ])
  if (decisions.error || manifest.error) throw new Error('Unable to load assessment evidence')
  return {
    viewedAt: new Date().toISOString(),
    accounts: accounts.data ?? [], latest, recommendations: decisions.data ?? [],
    preparation,
    context: manifest.data as unknown as Pick<DecisionContext, 'cutoff' | 'policy' | 'gaps'>,
  }
}

export async function fetchRecommendationEvidence(ownerId: string, batchId: string) {
  const client = database()
  const signal = AbortSignal.timeout(10_000)
  const batch = await client.from('recommendation_batches').select('manifest_id')
    .eq('owner_id', ownerId).eq('id', batchId).abortSignal(signal).single()
  if (batch.error) throw new Error('Assessment unavailable')
  const [evidence, events] = await Promise.all([
    evidenceCache.get(`${ownerId}:${batch.data.manifest_id}`, 3_600_000, async () => {
      const manifest = await client.from('recommendation_input_manifests').select('evidence:content->evidence,names:content->names')
        .eq('owner_id', ownerId).eq('id', batch.data.manifest_id).abortSignal(signal).single()
      if (manifest.error) throw new Error('Unable to load source details')
      const sources = manifest.data.evidence as unknown as DecisionContext['evidence']
      return {evidence:sources.map(({ id, url, asOf, availableAt }) => ({ id, url, asOf, availableAt })),
        memos:frozenDecisionMemo({names:(manifest.data.names ?? []) as unknown as DecisionContext['names'],evidence:sources})}
    }),
    client.from('recommendation_owner_events').select('id,recommendation_id,event_type,rationale,recorded_at,recommendation_versions!inner(batch_id)')
      .eq('owner_id', ownerId).eq('recommendation_versions.batch_id', batchId)
      .order('recorded_at', { ascending: false }).limit(100).abortSignal(signal),
  ])
  if (events.error) throw new Error('Unable to load source details')
  return {
    evidence: evidence?.evidence ?? [],
    memos: evidence?.memos ?? [],
    events: events.data ?? [],
  }
}

export async function fetchRecommendationLearning(ownerId: string) {
  const client = database()
  const signal = AbortSignal.timeout(10_000)
  const [evaluations, cohorts, forecasts, shadowRuns, shadowEvaluations] = await Promise.all([
    client.from('recommendation_evaluations').select('id,recommendation_id,kind,horizon,content,as_of').eq('owner_id', ownerId)
      .order('created_at', { ascending: false }).limit(100).abortSignal(signal),
    client.from('recommendation_cohort_reviews').select('id,content').eq('policy_version', FORECAST_RESOLUTION_POLICY)
      .eq('owner_id', ownerId).order('created_at', { ascending: false }).limit(4).abortSignal(signal),
    client.from('recommendation_forecasts').select('*,recommendation_versions!inner(content)').eq('owner_id', ownerId)
      .order('deadline').limit(100).abortSignal(signal),
    client.from('recommendation_shadow_runs').select('id').eq('owner_id', ownerId)
      .order('created_at', { ascending: false }).limit(100).abortSignal(signal),
    client.from('recommendation_shadow_evaluations').select('id,content').eq('evaluator_version', `shadow-calibration-${FORECAST_RESOLUTION_POLICY}`)
      .eq('owner_id', ownerId).order('created_at', { ascending: false }).limit(30).abortSignal(signal),
  ])
  for (const response of [evaluations, cohorts, forecasts, shadowRuns, shadowEvaluations]) {
    if (response.error) throw new Error('Track record is temporarily unavailable')
  }
  const versions = await client.from('recommendation_versions').select('id,symbol,portfolio_id,issued_at,content,recommendation_batches(manifest_id)')
    .eq('owner_id', ownerId).order('issued_at',{ascending:false}).limit(60).abortSignal(signal)
  if (versions.error) throw new Error('Recommendation timeline is temporarily unavailable')
  const ids = (versions.data ?? []).map(v => v.id)
  const manifestIds = [...new Set((versions.data ?? []).map(v => (v.recommendation_batches as unknown as Row).manifest_id))]
  const [tasks, outcomes, events, manifests] = ids.length ? await Promise.all([
    client.from('recommendation_evaluation_tasks').select('*').eq('owner_id',ownerId).in('recommendation_id',ids).eq('kind','aging').abortSignal(signal),
    client.from('recommendation_evaluations').select('id,recommendation_id,kind,horizon,content,as_of').eq('owner_id',ownerId).in('recommendation_id',ids).order('created_at',{ascending:false}).limit(1500).abortSignal(signal),
    client.from('recommendation_owner_events').select('id,recommendation_id,event_type,recorded_at,rationale,details').eq('owner_id',ownerId).in('recommendation_id',ids).order('recorded_at',{ascending:false}).limit(500).abortSignal(signal),
    client.from('recommendation_input_manifests').select('id,cutoff:content->cutoff,gaps:content->gaps').eq('owner_id',ownerId).in('id',manifestIds).abortSignal(signal),
  ]) : [{data:[],error:null},{data:[],error:null},{data:[],error:null},{data:[],error:null}]
  for (const r of [tasks,outcomes,events,manifests]) if (r.error) throw new Error('Recommendation timeline is temporarily unavailable')
  const timelines = (versions.data ?? []).map(v => {
    const manifest = manifests.data?.find(m => m.id === (v.recommendation_batches as unknown as Row).manifest_id)
    return {id:v.id,symbol:v.symbol,portfolioId:v.portfolio_id,issuedAt:v.issued_at,recommendation:v.content as Recommendation,
      tasks:(tasks.data ?? []).filter(t => t.recommendation_id === v.id), evaluations:(outcomes.data ?? []).filter(e => e.recommendation_id === v.id),
      ownerEvents:(events.data ?? []).filter(e => e.recommendation_id === v.id),
      coverage:{cutoff:manifest?.cutoff, citedSources:(v.content as Recommendation).sourceIds.length, editionGaps:manifest?.gaps ?? []}}
  })
  return {
    timelines, timelineCoverage:'Latest 60 immutable issued versions; up to 1,500 recent assessments and 500 owner reports. Citation counts describe references, not proof of source completeness.',
    evaluations: evaluations.data ?? [], cohorts: cohorts.data ?? [],
    forecasts: (forecasts.data ?? []).filter(forecast => forecastsAreApproved((forecast.recommendation_versions as unknown as Row).content))
      .map(forecast => { const copy = { ...forecast }; delete copy.recommendation_versions; return copy }),
    shadowRuns: shadowRuns.data ?? [], shadowEvaluations: shadowEvaluations.data ?? [],
  }
}
