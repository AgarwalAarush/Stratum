import { getSupabaseClient } from './supabase.ts'
import { publicationHealth, economicLearningSummary } from '../markets/learning-health.ts'
import { FORECAST_REVIEW_POLICY } from '../markets/forecast-review.ts'

export async function fetchLearningHealth(ownerId: string, now = new Date()) {
  const db = getSupabaseClient()
  if (!db) throw new Error('Learning status is unavailable')
  const signal = AbortSignal.timeout(10_000)
  const [ingestion, world, decisions, evaluation, queue, runs, cohort, outcomes] = await Promise.all([
    db.from('agent_jobs').select('updated_at').eq('job_type', 'refresh-world-events').eq('status', 'succeeded').order('updated_at', { ascending: false }).limit(1).abortSignal(signal),
    db.from('world_repository_projections').select('projected_at').order('projected_at', { ascending: false }).limit(1).abortSignal(signal),
    db.from('recommendation_batches').select('published_at').eq('owner_id', ownerId).order('published_at', { ascending: false }).limit(1).abortSignal(signal),
    db.from('recommendation_cohort_reviews').select('created_at').eq('owner_id', ownerId).eq('policy_version', FORECAST_REVIEW_POLICY).order('created_at', { ascending: false }).limit(1).abortSignal(signal),
    db.from('agent_jobs').select('id', { count: 'exact', head: true }).eq('status', 'queued').abortSignal(signal),
    db.from('world_thinker_runs').select('status').order('started_at', { ascending: false }).limit(100).abortSignal(signal),
    db.from('recommendation_cohort_reviews').select('content').eq('owner_id', ownerId).eq('policy_version', FORECAST_REVIEW_POLICY).order('created_at', { ascending: false }).limit(1).abortSignal(signal),
    db.from('recommendation_evaluations').select('recommendation_id,horizon,content').eq('owner_id', ownerId).eq('kind', 'thesis').order('created_at', { ascending: false }).limit(100).abortSignal(signal),
  ])
  const checks = { ingestion, world, decisions, evaluation, queue, runs, cohort, outcomes }
  for (const [stage, result] of Object.entries(checks)) if (result.error) throw new Error(`Learning status ${stage}: ${result.error.message}`)
  const stages = [
    { label: 'Evidence intake', at: ingestion.data?.[0]?.updated_at ?? null, maxAge: 2 },
    { label: 'Accepted World update', at: world.data?.[0]?.projected_at ?? null, maxAge: 48 },
    { label: 'Investment assessment', at: decisions.data?.[0]?.published_at ?? null, maxAge: 48 },
    { label: 'Outcome review', at: evaluation.data?.[0]?.created_at ?? null, maxAge: 48 },
  ].map(s => ({ ...s, status: publicationHealth(s.at, s.maxAge, now.getTime()) }))
  const content = cohort.data?.[0]?.content ?? {}
  return { checkedAt: now.toISOString(), stages, queuedJobs: queue.count ?? 0,
    runs: { sampled: runs.data?.length ?? 0, accepted: runs.data?.filter(r => ['projected', 'push_pending'].includes(r.status)).length ?? 0,
      rejected: runs.data?.filter(r => r.status === 'rejected').length ?? 0, failed: runs.data?.filter(r => r.status === 'failed').length ?? 0 },
    learning: { resolvedEpisodes: content.calibration?.independentEpisodes ?? 0, unresolvedEpisodes: content.calibration?.unresolved ?? 0,
      blocker: content.learning?.mostFrequentGate?.[0] ?? null, blockerCount: content.learning?.mostFrequentGate?.[1] ?? 0 },
    outcomes: economicLearningSummary(outcomes.data ?? []),
  }
}
