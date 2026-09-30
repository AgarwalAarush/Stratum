import { getSupabaseClient } from './supabase.ts'
import { FORECAST_REVIEW_POLICY, forecastsAreApproved } from '../markets/forecast-review.ts'
import type { DecisionContext } from '../markets/recommendations.ts'
import { AsyncTtlCache } from './async-ttl-cache.ts'

type Row = Record<string, unknown>
type SourceReference = Pick<DecisionContext['evidence'][number], 'id' | 'url' | 'asOf' | 'availableAt'>
const evidenceCache = new AsyncTtlCache<SourceReference[]>({ maxEntries: 16 })
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
      const manifest = await client.from('recommendation_input_manifests').select('evidence:content->evidence')
        .eq('owner_id', ownerId).eq('id', batch.data.manifest_id).abortSignal(signal).single()
      if (manifest.error) throw new Error('Unable to load source details')
      const sources = manifest.data.evidence as unknown as DecisionContext['evidence']
      return sources.map(({ id, url, asOf, availableAt }) => ({ id, url, asOf, availableAt }))
    }),
    client.from('recommendation_owner_events').select('id,recommendation_id,event_type,rationale,recorded_at,recommendation_versions!inner(batch_id)')
      .eq('owner_id', ownerId).eq('recommendation_versions.batch_id', batchId)
      .order('recorded_at', { ascending: false }).limit(100).abortSignal(signal),
  ])
  if (events.error) throw new Error('Unable to load source details')
  return {
    evidence: evidence ?? [],
    events: events.data ?? [],
  }
}

export async function fetchRecommendationLearning(ownerId: string) {
  const client = database()
  const signal = AbortSignal.timeout(10_000)
  const [evaluations, cohorts, forecasts, shadowRuns, shadowEvaluations] = await Promise.all([
    client.from('recommendation_evaluations').select('id,kind,horizon,content,as_of').eq('owner_id', ownerId)
      .order('created_at', { ascending: false }).limit(100).abortSignal(signal),
    client.from('recommendation_cohort_reviews').select('id,content').eq('policy_version', FORECAST_REVIEW_POLICY)
      .eq('owner_id', ownerId).order('created_at', { ascending: false }).limit(4).abortSignal(signal),
    client.from('recommendation_forecasts').select('*,recommendation_versions!inner(content)').eq('owner_id', ownerId)
      .order('deadline').limit(100).abortSignal(signal),
    client.from('recommendation_shadow_runs').select('id').eq('owner_id', ownerId)
      .order('created_at', { ascending: false }).limit(100).abortSignal(signal),
    client.from('recommendation_shadow_evaluations').select('id,content').eq('evaluator_version', `shadow-calibration-${FORECAST_REVIEW_POLICY}`)
      .eq('owner_id', ownerId).order('created_at', { ascending: false }).limit(30).abortSignal(signal),
  ])
  for (const response of [evaluations, cohorts, forecasts, shadowRuns, shadowEvaluations]) {
    if (response.error) throw new Error('Track record is temporarily unavailable')
  }
  return {
    evaluations: evaluations.data ?? [], cohorts: cohorts.data ?? [],
    forecasts: (forecasts.data ?? []).filter(forecast => forecastsAreApproved((forecast.recommendation_versions as unknown as Row).content))
      .map(forecast => { const copy = { ...forecast }; delete copy.recommendation_versions; return copy }),
    shadowRuns: shadowRuns.data ?? [], shadowEvaluations: shadowEvaluations.data ?? [],
  }
}
