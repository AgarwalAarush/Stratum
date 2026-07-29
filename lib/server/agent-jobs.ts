import { generateMorningBrief } from '../data/morning-brief.ts'
import { generateMonthlyOverview, generateWeeklyOverview } from '../data/overview-generators.ts'
import { saveMorningBrief } from '../data/overview-persistence.ts'
import { syncFmpMarketIntelligence } from '../data/fmp-intelligence.ts'
import { getAlpacaClient } from './alpaca.ts'
import { materializeCrossAssetSnapshot } from './cross-asset.ts'
import { materializeCandidateScout } from './candidate-scout.ts'
import { materializeMarketLeadership } from './market-leadership.ts'
import { generateFullEquityResearch } from './company-research.ts'
import { scanResearchRefreshes } from './research-monitoring.ts'
import { materializeMarketMemo } from './market-memo.ts'
import { resolveMarketUniverse } from './market-universe.ts'
import {
  fetchPersistedMarketAssets,
  materializeAlpacaScreener,
  syncAlpacaAssets,
} from './markets-ingestion.ts'
import { fetchLatestSnapshotMeta } from './markets-repository.ts'
import { getSupabaseClient } from './supabase.ts'

export const AGENT_JOB_TYPES = [
  'sync-market-assets',
  'refresh-market-screener',
  'refresh-cross-asset',
  'materialize-market-leadership',
  'run-candidate-scout',
  'generate-company-research',
  'event-refresh-company-research',
  'scan-research-refreshes',
  'refresh-fmp-intelligence',
  'generate-market-memo',
  'generate-morning-brief',
  'generate-weekly-overview',
  'generate-monthly-overview',
] as const

export type AgentJobType = typeof AGENT_JOB_TYPES[number]
export type AgentJobProvider = 'alpaca' | 'fmp' | 'codex' | 'market-data'

interface AgentJobRecord {
  id: string
  job_type: AgentJobType
  payload: Record<string, unknown>
  attempts: number
  max_attempts: number
}

export function normalizeClaimedAgentJob(data: unknown): AgentJobRecord | null {
  const job = Array.isArray(data) ? data[0] : data
  if (!job || typeof job !== 'object') return null
  const record = job as Partial<AgentJobRecord>
  if (
    typeof record.id !== 'string'
    || typeof record.job_type !== 'string'
    || !AGENT_JOB_TYPES.includes(record.job_type as AgentJobType)
  ) return null
  return record as AgentJobRecord
}

export function parseAgentJobType(value: unknown): AgentJobType {
  if (typeof value !== 'string' || !AGENT_JOB_TYPES.includes(value as AgentJobType)) {
    throw new Error('Unsupported agent job type')
  }
  return value as AgentJobType
}

export function buildAgentJobDedupeKey(jobType: AgentJobType, now = new Date(), payload: Record<string, unknown> = {}): string {
  if (jobType === 'generate-market-memo' && typeof payload.snapshotId === 'string') return `${jobType}:${payload.snapshotId}`
  if (jobType === 'refresh-market-screener') {
    const bucket = new Date(now)
    bucket.setUTCMinutes(Math.floor(bucket.getUTCMinutes() / 5) * 5, 0, 0)
    return `${jobType}:${bucket.toISOString()}`
  }
  if (jobType === 'refresh-cross-asset') {
    if (payload.mode === 'daily') return `${jobType}:daily:${now.toISOString().slice(0, 10)}`
    const bucket = new Date(now)
    bucket.setUTCMinutes(Math.floor(bucket.getUTCMinutes() / 5) * 5, 0, 0)
    return `${jobType}:${bucket.toISOString()}`
  }
  if (jobType === 'refresh-fmp-intelligence') {
    const bucket = new Date(now)
    bucket.setUTCMinutes(Math.floor(bucket.getUTCMinutes() / 15) * 15, 0, 0)
    return `${jobType}:${bucket.toISOString()}`
  }
  if (jobType === 'scan-research-refreshes') {
    const bucket = new Date(now)
    bucket.setUTCMinutes(Math.floor(bucket.getUTCMinutes() / 15) * 15, 0, 0)
    return `${jobType}:${bucket.toISOString()}`
  }
  if ((jobType === 'materialize-market-leadership' || jobType === 'run-candidate-scout') && typeof payload.tradingDate === 'string') {
    return `${jobType}:${payload.tradingDate}`
  }
  if ((jobType === 'generate-company-research' || jobType === 'event-refresh-company-research')
    && typeof payload.ownerId === 'string' && typeof payload.symbol === 'string') {
    const event = typeof payload.eventId === 'string' ? `:${payload.eventId}` : ''
    return `${jobType}:${payload.ownerId}:${payload.symbol}:${now.toISOString().slice(0, 10)}${event}`
  }
  return `${jobType}:${now.toISOString().slice(0, 10)}`
}

export function agentJobProvider(jobType: AgentJobType): AgentJobProvider {
  if (jobType === 'sync-market-assets' || jobType === 'refresh-market-screener') return 'alpaca'
  if (jobType === 'refresh-fmp-intelligence' || jobType === 'run-candidate-scout') return 'fmp'
  if (jobType === 'refresh-cross-asset' || jobType === 'materialize-market-leadership' || jobType === 'scan-research-refreshes') return 'market-data'
  return 'codex'
}

export function isMissingDedupeConstraint(message: string): boolean {
  return message.includes('no unique or exclusion constraint matching the ON CONFLICT specification')
}

export function shouldRefreshClosedMarket(
  snapshot: { published_at: string | null } | null,
  now = new Date(),
): boolean {
  if (!snapshot?.published_at) return true
  const publishedAt = Date.parse(snapshot.published_at)
  return !Number.isFinite(publishedAt) || now.getTime() - publishedAt >= 6 * 60 * 60 * 1_000
}

interface StaleAgentJob {
  id: string
  attempts: number
  max_attempts: number
}

export async function recoverStaleAgentJobs(
  now = new Date(),
  staleAfterMs = 45 * 60 * 1_000,
): Promise<number> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const staleBefore = new Date(now.getTime() - staleAfterMs).toISOString()
  const { data, error } = await supabase
    .from('agent_jobs')
    .select('id,attempts,max_attempts')
    .eq('status', 'running')
    .lt('claimed_at', staleBefore)
  if (error) throw new Error(`Unable to inspect stale agent jobs: ${error.message}`)
  const jobs = (data ?? []) as StaleAgentJob[]
  if (jobs.length === 0) return 0

  const retryableIds = jobs.filter((job) => job.attempts < job.max_attempts).map((job) => job.id)
  const exhaustedIds = jobs.filter((job) => job.attempts >= job.max_attempts).map((job) => job.id)
  const recoveredAt = now.toISOString()
  const recoveryError = 'Recovered after the worker stopped while this job was running.'
  const updates = [
    supabase.from('agent_runs').update({
      status: 'failed',
      error: recoveryError,
      finished_at: recoveredAt,
    }).in('job_id', jobs.map((job) => job.id)).eq('status', 'running'),
  ]
  if (retryableIds.length > 0) {
    updates.push(supabase.from('agent_jobs').update({
      status: 'queued',
      claimed_by: null,
      claimed_at: null,
      run_after: recoveredAt,
      last_error: recoveryError,
      updated_at: recoveredAt,
    }).in('id', retryableIds).eq('status', 'running'))
  }
  if (exhaustedIds.length > 0) {
    updates.push(supabase.from('agent_jobs').update({
      status: 'failed',
      claimed_by: null,
      claimed_at: null,
      last_error: recoveryError,
      updated_at: recoveredAt,
    }).in('id', exhaustedIds).eq('status', 'running'))
  }
  const results = await Promise.all(updates)
  const updateError = results.find((result) => result.error)?.error
  if (updateError) throw new Error(`Unable to recover stale agent jobs: ${updateError.message}`)
  return jobs.length
}

export async function enqueueAgentJob(
  jobType: AgentJobType,
  payload: Record<string, unknown> = {},
  dedupeKey = buildAgentJobDedupeKey(jobType, new Date(), payload),
): Promise<{ id: string; deduplicated: boolean }> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')

  const { data, error } = await supabase
    .from('agent_jobs')
    .upsert({ job_type: jobType, payload, dedupe_key: dedupeKey }, { onConflict: 'dedupe_key', ignoreDuplicates: true })
    .select('id')
    .maybeSingle()
  if (error && !isMissingDedupeConstraint(error.message)) {
    throw new Error(`Unable to enqueue agent job: ${error.message}`)
  }
  if (data) return { id: data.id, deduplicated: false }

  const { data: existing, error: existingError } = await supabase
    .from('agent_jobs')
    .select('id')
    .eq('dedupe_key', dedupeKey)
    .maybeSingle()
  if (existingError) throw new Error(`Unable to find deduplicated agent job: ${existingError.message}`)
  if (existing) return { id: existing.id, deduplicated: true }

  if (!error) throw new Error(`Unable to find deduplicated agent job: ${dedupeKey}`)
  const { data: inserted, error: insertError } = await supabase
    .from('agent_jobs')
    .insert({ job_type: jobType, payload, dedupe_key: dedupeKey })
    .select('id')
    .single()
  if (insertError || !inserted) {
    throw new Error(`Unable to enqueue agent job without the dedupe index: ${insertError?.message ?? dedupeKey}`)
  }
  return { id: inserted.id, deduplicated: false }
}

async function executeJob(
  job: AgentJobRecord,
  reportProgress: (progress: number, phase: string) => Promise<void> = async () => {},
): Promise<unknown> {
  if (job.job_type === 'sync-market-assets') {
    const assets = await syncAlpacaAssets()
    const universe = await resolveMarketUniverse(assets, { forceRefresh: true })
    return { count: assets.length, screenerUniverseCount: universe.length }
  }

  if (job.job_type === 'refresh-market-screener') {
    const client = getAlpacaClient()
    if (!client) throw new Error('Alpaca credentials are not configured')
    const clock = await client.fetchClock()
    if (!clock.isOpen) {
      const latest = await fetchLatestSnapshotMeta()
      if (!shouldRefreshClosedMarket(latest)) {
        return { skipped: 'market_closed_recent_snapshot', nextOpen: clock.nextOpen }
      }
    }

    let assets = await fetchPersistedMarketAssets()
    if (assets.length === 0) assets = await syncAlpacaAssets(client)
    assets = await resolveMarketUniverse(assets)
    const snapshot = await materializeAlpacaScreener({ client, assets })
    await enqueueAgentJob('generate-market-memo', { snapshotId: snapshot.snapshotId })
    return snapshot
  }

  if (job.job_type === 'refresh-fmp-intelligence') {
    return syncFmpMarketIntelligence()
  }

  if (job.job_type === 'refresh-cross-asset') {
    const snapshot = await materializeCrossAssetSnapshot()
    return {
      snapshotId: snapshot.id,
      observationCount: snapshot.observations.length,
      dataAsOf: snapshot.dataAsOf,
    }
  }

  if (job.job_type === 'materialize-market-leadership') {
    const leadership = await materializeMarketLeadership()
    await enqueueAgentJob(
      'run-candidate-scout',
      { leadershipSnapshotId: leadership.id, tradingDate: leadership.tradingDate },
      `run-candidate-scout:${leadership.tradingDate}`,
    )
    return {
      snapshotId: leadership.id,
      tradingDate: leadership.tradingDate,
      usableCount: leadership.usableCount,
      groupCount: leadership.subIndustries.length,
    }
  }

  if (job.job_type === 'run-candidate-scout') {
    const briefs = await materializeCandidateScout()
    return {
      candidateCount: briefs.length,
      symbols: briefs.map((brief) => brief.symbol),
      tradingDate: briefs[0]?.tradingDate ?? null,
    }
  }

  if (job.job_type === 'generate-company-research' || job.job_type === 'event-refresh-company-research') {
    const ownerId = typeof job.payload.ownerId === 'string' ? job.payload.ownerId : ''
    const symbol = typeof job.payload.symbol === 'string' ? job.payload.symbol.toUpperCase() : ''
    if (!ownerId || !symbol) throw new Error('Research jobs require ownerId and symbol')
    const note = await generateFullEquityResearch(
      symbol,
      ownerId,
      String(job.payload.reason ?? 'manual'),
      reportProgress,
    )
    return { researchNoteId: note.id, symbol, version: note.version, dataAsOf: note.dataAsOf }
  }

  if (job.job_type === 'scan-research-refreshes') {
    return scanResearchRefreshes()
  }

  if (job.job_type === 'generate-market-memo') {
    const snapshotId = typeof job.payload.snapshotId === 'string'
      ? job.payload.snapshotId
      : (await fetchLatestSnapshotMeta())?.id
    if (!snapshotId) throw new Error('No completed market snapshot is available')
    return materializeMarketMemo(snapshotId)
  }

  if (job.job_type === 'generate-morning-brief') {
    const brief = await generateMorningBrief({ provider: 'codex' })
    await saveMorningBrief(brief)
    return { sectionCount: brief.sections.length, generatedAt: brief.generatedAt }
  }

  if (job.job_type === 'generate-weekly-overview') {
    const result = await generateWeeklyOverview({ provider: 'codex' })
    if (!result.success) throw new Error(result.error ?? 'Weekly overview generation failed')
    return result
  }

  const result = await generateMonthlyOverview({ provider: 'codex' })
  if (!result.success) throw new Error(result.error ?? 'Monthly overview generation failed')
  return result
}

export async function processOneAgentJob(workerId: string): Promise<boolean> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')

  const { data, error } = await supabase.rpc('claim_agent_job', { p_worker_id: workerId })
  if (error) throw new Error(`Unable to claim agent job: ${error.message}`)
  const job = normalizeClaimedAgentJob(data)
  if (!job) return false

  const startedAt = Date.now()
  const provider = agentJobProvider(job.job_type)
  const model = provider === 'codex' ? (process.env.CODEX_SYNTHESIS_MODEL ?? 'gpt-5.6-terra') : null
  const { data: run, error: runError } = await supabase
    .from('agent_runs')
    .insert({ job_id: job.id, worker_id: workerId, status: 'running', provider, model, input_refs: [job.payload] })
    .select('id')
    .single()
  if (runError || !run) throw new Error(`Unable to create agent run: ${runError?.message ?? 'unknown error'}`)
  const reportProgress = async (progress: number, phase: string) => {
    await supabase.from('agent_runs').update({
      output: {
        progress: Math.max(0, Math.min(100, Math.round(progress))),
        phase,
        updatedAt: new Date().toISOString(),
      },
    }).eq('id', run.id).eq('status', 'running')
  }

  try {
    const output = await executeJob(job, reportProgress)
    await Promise.all([
      supabase.from('agent_runs').update({
        status: 'succeeded', output, finished_at: new Date().toISOString(), duration_ms: Date.now() - startedAt,
      }).eq('id', run.id),
      supabase.from('agent_jobs').update({ status: 'succeeded', updated_at: new Date().toISOString() }).eq('id', job.id),
    ])
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const retry = job.attempts < job.max_attempts
    const runAfter = new Date(Date.now() + Math.min(30, 2 ** job.attempts) * 60_000).toISOString()
    await Promise.all([
      supabase.from('agent_runs').update({
        status: 'failed', error: message, finished_at: new Date().toISOString(), duration_ms: Date.now() - startedAt,
      }).eq('id', run.id),
      supabase.from('agent_jobs').update({
        status: retry ? 'queued' : 'failed', last_error: message, run_after: runAfter, updated_at: new Date().toISOString(),
      }).eq('id', job.id),
    ])
  }

  return true
}
