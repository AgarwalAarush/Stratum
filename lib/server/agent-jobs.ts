import { generateMorningBrief } from '../data/morning-brief.ts'
import { generateMonthlyOverview, generateWeeklyOverview } from '../data/overview-generators.ts'
import { saveMorningBrief } from '../data/overview-persistence.ts'
import { syncFmpMarketIntelligence } from '../data/fmp-intelligence.ts'
import { marketMemoSlot } from '../markets/market-clock.ts'
import { getAlpacaClient } from './alpaca.ts'
import { materializeCrossAssetSnapshot } from './cross-asset.ts'
import { materializeCandidateScout } from './candidate-scout.ts'
import { materializeCandidateWeeklySummary } from './candidate-weekly-summary.ts'
import { materializeMarketLeadership } from './market-leadership.ts'
import { materializeMarketHomeSnapshot } from './market-home.ts'
import { generateFullEquityResearch, materializeCompanyPacket } from './company-research.ts'
import { generateEtfResearch } from './etf-research.ts'
import { scanResearchRefreshes } from './research-monitoring.ts'
import { monitorInvestmentTheses } from './thesis-monitoring.ts'
import { materializeMarketMemo } from './market-memo.ts'
import { pruneMarketData } from './market-retention.ts'
import { refreshExpandedMarketUniverse, resolveMarketUniverse } from './market-universe.ts'
import { getFmpUsageSnapshot, type FmpUsageSnapshot } from './fmp.ts'
import { cacheFmpFiveYearPriceHistory } from './stock-price-history.ts'
import { syncRobinhoodPortfolio, type RobinhoodSyncSlot } from './robinhood-portfolio-sync.ts'
import {
  compileWorldBaseline,
  ingestWorldObservation,
  isMarketAutoThesisEnabled,
  isMarketWorldModelEnabled,
  runMarketWorldCycle,
} from './world-memory.ts'
import { backupMarketCorpus, verifyMarketCorpusBackup } from './world-backup.ts'
import { getWorldSourceAdapter, listWorldSourceAdapters } from './world-sources.ts'
import { fetchActiveMarketDomainPacks, findCandidateSourcePreflights, findWorldSourceCoverageScoutPlans, isMarketDomainActive, runWorldSourceScout } from './world-source-control.ts'
import { runMarketResearchScout } from './market-research-scout.ts'
import { auditWorldSourceHealth, preflightWorldSourceCandidate } from './world-source-health.ts'
import { collectGovernedWorldSourceDocuments } from './world-source-collector.ts'
import { triageCapturedWorldObservationProposals } from './world-observation-proposals.ts'
import { AI_MODELS } from '../ai/config.ts'
import { scheduledMarketResearchRunLimit, selectMarketModel, type MarketModelSelection } from './market-model-policy.ts'
import { evaluateMarketPrediction, findDueMarketPredictionEvaluations } from './market-prediction-evaluation.ts'
import {
  fetchPersistedMarketAssets,
  materializeAlpacaScreener,
  syncAlpacaAssets,
} from './markets-ingestion.ts'
import { fetchLatestSnapshotMeta } from './markets-repository.ts'
import { getSupabaseClient } from './supabase.ts'
import { materializeIntelligenceSourceReferrals } from './intelligence-source-referrals.ts'
import { fetchPortfolioResearchCoverage, fetchPortfolioResearchSeedOwners } from './portfolio-research-seeding.ts'

export const AGENT_JOB_TYPES = [
  'sync-market-assets',
  'sync-robinhood-portfolio',
  'refresh-market-screener',
  'prune-market-data',
  'refresh-cross-asset',
  'materialize-market-leadership',
  'run-candidate-scout',
  'summarize-candidate-scout',
  'refresh-company-packet',
  'generate-company-research',
  'generate-etf-research',
  'event-refresh-company-research',
  'scan-research-refreshes',
  'seed-portfolio-company-research',
  'monitor-investment-theses',
  'refresh-fmp-intelligence',
  'fetch-stock-price-history',
  'generate-market-memo',
  'generate-morning-brief',
  'generate-weekly-overview',
  'generate-monthly-overview',
  'ingest-world-source',
  'run-market-thesis-cycle',
  'verify-world-source-health',
  'preflight-world-source-candidate',
  'collect-world-source-documents',
  'triage-world-observation-proposals',
  'auto-accept-observation-proposals',
  'scout-market-research',
  'scout-world-sources',
  'review-world-source-coverage',
  'scan-intelligence-source-referrals',
  'compile-world-baseline',
  'correlate-market-signals',
  'synthesize-market-hypotheses',
  'deepen-market-hypothesis',
  'refresh-market-hypothesis-research',
  'route-market-research-frontiers',
  'orchestrate-market-research',
  'evaluate-market-prediction',
  'evaluate-market-predictions',
  'monitor-market-theses',
  'backup-market-corpus',
  'verify-market-corpus',
] as const

export type AgentJobType = typeof AGENT_JOB_TYPES[number]
export type AgentJobProvider = 'alpaca' | 'fmp' | 'codex' | 'market-data' | 'robinhood'

interface AgentJobRecord {
  id: string
  job_type: AgentJobType
  payload: Record<string, unknown>
  attempts: number
  max_attempts: number
}

function fmpUsageDelta(before: FmpUsageSnapshot, after: FmpUsageSnapshot) {
  return {
    requests: after.totalRequests - before.totalRequests,
    responseBytes: after.responseBytes - before.responseBytes,
    throttledRequests: after.throttledRequests - before.throttledRequests,
    requestsInTrailingMinute: after.windowRequests,
  }
}

function outputWithUsage(output: unknown, before: FmpUsageSnapshot, after: FmpUsageSnapshot): unknown {
  const delta = fmpUsageDelta(before, after)
  if (delta.requests === 0) return output
  if (output && typeof output === 'object' && !Array.isArray(output)) {
    return { ...output as Record<string, unknown>, providerUsage: { fmp: delta } }
  }
  return { result: output, providerUsage: { fmp: delta } }
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
  if (jobType === 'run-market-thesis-cycle' && typeof payload.cycleDate === 'string' && (payload.cycle === 'pre-market' || payload.cycle === 'post-close')) {
    return `${jobType}:${payload.cycleDate}:${payload.cycle}`
  }
  if (jobType === 'sync-robinhood-portfolio' && typeof payload.tradingDate === 'string' && typeof payload.slot === 'string') {
    return `${jobType}:${payload.tradingDate}:${payload.slot}`
  }
  if (jobType === 'generate-market-memo' && typeof payload.snapshotId === 'string') return `${jobType}:${payload.snapshotId}`
  if (jobType === 'refresh-market-screener') {
    if (payload.mode === 'coverage' && typeof payload.symbol === 'string') {
      return `${jobType}:coverage:${payload.symbol.toUpperCase()}:${now.toISOString().slice(0, 10)}`
    }
    if (payload.mode === 'daily') return `${jobType}:daily:${now.toISOString().slice(0, 10)}`
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
    const cadence = typeof payload.cadenceMinutes === 'number'
      ? Math.max(15, Math.min(240, Math.round(payload.cadenceMinutes)))
      : 15
    const bucket = new Date(now)
    const bucketMs = cadence * 60_000
    bucket.setTime(Math.floor(bucket.getTime() / bucketMs) * bucketMs)
    return `${jobType}:${bucket.toISOString()}`
  }
  if (jobType === 'fetch-stock-price-history' && typeof payload.symbol === 'string') {
    const bucket = new Date(now)
    bucket.setUTCMinutes(Math.floor(bucket.getUTCMinutes() / 5) * 5, 0, 0)
    return `${jobType}:${payload.symbol.trim().toUpperCase()}:${bucket.toISOString()}`
  }
  if (jobType === 'scan-research-refreshes') {
    const cadence = typeof payload.cadenceMinutes === 'number'
      ? Math.max(15, Math.min(240, Math.round(payload.cadenceMinutes)))
      : 15
    const bucket = new Date(now)
    const bucketMs = cadence * 60_000
    bucket.setTime(Math.floor(bucket.getTime() / bucketMs) * bucketMs)
    return `${jobType}:${bucket.toISOString()}`
  }
  if (jobType === 'seed-portfolio-company-research') return `${jobType}:${now.toISOString().slice(0, 10)}`
  if (jobType === 'monitor-investment-theses') {
    const cadence = typeof payload.cadenceMinutes === 'number'
      ? Math.max(5, Math.min(240, Math.round(payload.cadenceMinutes)))
      : 15
    const bucket = new Date(now)
    const bucketMs = cadence * 60_000
    bucket.setTime(Math.floor(bucket.getTime() / bucketMs) * bucketMs)
    return `${jobType}:${bucket.toISOString()}`
  }
  if (jobType === 'compile-world-baseline' || jobType === 'correlate-market-signals' || jobType === 'synthesize-market-hypotheses' || jobType === 'monitor-market-theses') {
    const evidenceFingerprint = typeof payload.evidenceFingerprint === 'string' ? payload.evidenceFingerprint.trim() : ''
    if (evidenceFingerprint && (jobType === 'compile-world-baseline' || jobType === 'synthesize-market-hypotheses')) {
      const scope = jobType === 'compile-world-baseline'
        ? `${payload.scopeType === 'domain' ? 'domain' : 'global'}:${typeof payload.scopeKey === 'string' ? payload.scopeKey : 'global'}`
        : ''
      return `${jobType}:${scope}:evidence:${evidenceFingerprint}`
    }
    const bucket = new Date(now)
    const cadence = jobType === 'monitor-market-theses' ? 60 : jobType === 'compile-world-baseline' ? 60 : 24 * 60
    bucket.setTime(Math.floor(bucket.getTime() / (cadence * 60_000)) * cadence * 60_000)
    const scope = jobType === 'compile-world-baseline'
      ? `${payload.scopeType === 'domain' ? 'domain' : 'global'}:${typeof payload.scopeKey === 'string' ? payload.scopeKey : 'global'}`
      : ''
    return `${jobType}:${scope}:${bucket.toISOString()}`
  }
  if (jobType === 'deepen-market-hypothesis' && typeof payload.ownerId === 'string' && typeof payload.hypothesisId === 'string') {
    return `${jobType}:${payload.ownerId}:${payload.hypothesisId}:${now.toISOString().slice(0, 10)}`
  }
  if (jobType === 'refresh-market-hypothesis-research') {
    const bucket = new Date(now)
    bucket.setUTCHours(Math.floor(bucket.getUTCHours() / 6) * 6, 0, 0, 0)
    return `${jobType}:${bucket.toISOString()}`
  }
  if (jobType === 'route-market-research-frontiers') {
    const bucket = new Date(now)
    bucket.setUTCHours(Math.floor(bucket.getUTCHours() / 6) * 6, 0, 0, 0)
    return `${jobType}:${bucket.toISOString()}`
  }
  if (jobType === 'orchestrate-market-research') {
    const bucket = new Date(now)
    bucket.setUTCHours(Math.floor(bucket.getUTCHours() / 6) * 6, 0, 0, 0)
    return `${jobType}:${bucket.toISOString()}`
  }
  if (jobType === 'auto-accept-observation-proposals') {
    const domain = typeof payload.domainId === 'string' ? payload.domainId : 'all'
    const bucket = new Date(now)
    bucket.setUTCMinutes(Math.floor(bucket.getUTCMinutes() / 15) * 15, 0, 0)
    return `${jobType}:${domain}:${bucket.toISOString()}`
  }
  if (jobType === 'evaluate-market-prediction' && typeof payload.predictionId === 'string') {
    return `${jobType}:${payload.predictionId}:${now.toISOString().slice(0, 10)}`
  }
  if (jobType === 'evaluate-market-predictions') {
    const bucket = new Date(now)
    bucket.setUTCHours(Math.floor(bucket.getUTCHours() / 6) * 6, 0, 0, 0)
    return `${jobType}:${bucket.toISOString()}`
  }
  if (jobType === 'backup-market-corpus' || jobType === 'verify-market-corpus') return `${jobType}:${now.toISOString().slice(0, 10)}`
  if (jobType === 'ingest-world-source') {
    if (typeof payload.fingerprint === 'string') return `${jobType}:${payload.fingerprint}`
    if (typeof payload.adapterId === 'string') return `${jobType}:${payload.adapterId}:${now.toISOString().slice(0, 10)}`
  }
  if (jobType === 'triage-world-observation-proposals' && Array.isArray(payload.captureIds)) {
    const captures = payload.captureIds.filter((item): item is string => typeof item === 'string').sort().join(',')
    if (captures) return `${jobType}:${captures}`
  }
  if (jobType === 'verify-world-source-health') return `${jobType}:${now.toISOString().slice(0, 10)}`
  if (jobType === 'preflight-world-source-candidate' && typeof payload.slug === 'string') {
    return `${jobType}:${payload.slug.trim().toLowerCase()}:${now.toISOString().slice(0, 10)}`
  }
  if (jobType === 'scout-world-sources' && typeof payload.domainId === 'string') {
    // A frontier pass is deliberately capped to a few questions. Including its
    // stable frontier set lets the next bounded pass cover the remaining gap
    // today, while still deduplicating retries of the same request.
    const frontierIds = payload.trigger === 'frontier_gap' && Array.isArray(payload.frontierIds)
      ? payload.frontierIds.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).sort()
      : []
    if (frontierIds.length > 0) {
      return `${jobType}:${payload.domainId}:frontier:${frontierIds.join(',')}:${now.toISOString().slice(0, 10)}`
    }
    return `${jobType}:${payload.domainId}:${now.toISOString().slice(0, 10)}`
  }
  if (jobType === 'scout-market-research' && typeof payload.domainId === 'string') {
    const frontierIds = Array.isArray(payload.frontierIds)
      ? payload.frontierIds.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).sort()
      : []
    return `${jobType}:${payload.domainId}:${frontierIds.join(',') || 'manual'}:${now.toISOString().slice(0, 10)}`
  }
  if (jobType === 'review-world-source-coverage') return `${jobType}:${now.toISOString().slice(0, 10)}`
  if (jobType === 'scan-intelligence-source-referrals') return `${jobType}:${now.toISOString().slice(0, 10)}`
  if ((jobType === 'materialize-market-leadership' || jobType === 'run-candidate-scout') && typeof payload.tradingDate === 'string') {
    return `${jobType}:${payload.tradingDate}`
  }
  if (jobType === 'summarize-candidate-scout' && typeof payload.weekEnding === 'string') {
    return `${jobType}:${payload.weekEnding}`
  }
  if ((jobType === 'refresh-company-packet' || jobType === 'generate-company-research' || jobType === 'generate-etf-research' || jobType === 'event-refresh-company-research')
    && typeof payload.ownerId === 'string' && typeof payload.symbol === 'string') {
    const event = typeof payload.eventId === 'string' ? `:${payload.eventId}` : ''
    return `${jobType}:${payload.ownerId}:${payload.symbol}:${now.toISOString().slice(0, 10)}${event}`
  }
  return `${jobType}:${now.toISOString().slice(0, 10)}`
}

export function agentJobProvider(jobType: AgentJobType): AgentJobProvider {
  if (jobType === 'sync-robinhood-portfolio') return 'robinhood'
  if (jobType === 'sync-market-assets' || jobType === 'refresh-market-screener') return 'alpaca'
  if (jobType === 'refresh-fmp-intelligence' || jobType === 'fetch-stock-price-history' || jobType === 'run-candidate-scout' || jobType === 'refresh-company-packet') return 'fmp'
  if (jobType === 'ingest-world-source' || jobType === 'run-market-thesis-cycle' || jobType === 'verify-world-source-health' || jobType === 'preflight-world-source-candidate' || jobType === 'collect-world-source-documents') return 'market-data'
  if (jobType === 'triage-world-observation-proposals' || jobType === 'scout-market-research') return 'codex'
  if (
    jobType === 'refresh-cross-asset'
    || jobType === 'materialize-market-leadership'
    || jobType === 'scan-research-refreshes'
    || jobType === 'seed-portfolio-company-research'
    || jobType === 'monitor-investment-theses'
    || jobType === 'summarize-candidate-scout'
    || jobType === 'compile-world-baseline'
    || jobType === 'correlate-market-signals'
    || jobType === 'monitor-market-theses'
    || jobType === 'refresh-market-hypothesis-research'
    || jobType === 'route-market-research-frontiers'
    || jobType === 'orchestrate-market-research'
    || jobType === 'auto-accept-observation-proposals'
    || jobType === 'review-world-source-coverage'
    || jobType === 'scan-intelligence-source-referrals'
    || jobType === 'evaluate-market-predictions'
    || jobType === 'prune-market-data'
  ) return 'market-data'
  if (jobType === 'backup-market-corpus' || jobType === 'verify-market-corpus') return 'market-data'
  return 'codex'
}

/**
 * Durable worker telemetry must describe the exact policy choices used by a
 * job, not merely the generic fallback model. A deepening pass invokes both
 * an analyst and a critic; each remains visible in the immutable run input.
 */
export function marketModelRoutingForAgentJob(
  jobType: AgentJobType,
  environment: NodeJS.ProcessEnv = process.env,
): MarketModelSelection[] {
  const tasks = jobType === 'scout-world-sources'
    ? ['source_scout'] as const
    : jobType === 'scout-market-research'
      ? ['research_planning'] as const
    : jobType === 'triage-world-observation-proposals'
      ? ['observation_triage'] as const
      : jobType === 'deepen-market-hypothesis'
        ? ['hypothesis_analysis', 'hypothesis_critic'] as const
        : jobType === 'evaluate-market-prediction'
          ? ['prediction_evaluation'] as const
          : []
  return tasks.map((task) => selectMarketModel(task, environment))
}

export function modelForAgentJob(jobType: AgentJobType, environment: NodeJS.ProcessEnv = process.env): string | null {
  const routed = marketModelRoutingForAgentJob(jobType, environment)
  if (routed.length > 0) return routed[0]!.model
  return agentJobProvider(jobType) === 'codex'
    ? environment.CODEX_SYNTHESIS_MODEL ?? AI_MODELS.scheduledSynthesis
    : null
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

/** Lower values claim first. Human-initiated source verification must not wait
 * behind a backlog of routine market-refresh work, while it remains only
 * operational telemetry—not admission authority. */
export function agentJobPriority(jobType: AgentJobType): number {
  if (jobType === 'preflight-world-source-candidate') return 20
  if (jobType === 'verify-world-source-health') return 30
  if (jobType === 'scout-world-sources' || jobType === 'scout-market-research' || jobType === 'review-world-source-coverage' || jobType === 'scan-intelligence-source-referrals' || jobType === 'route-market-research-frontiers' || jobType === 'orchestrate-market-research' || jobType === 'auto-accept-observation-proposals') return 40
  if (jobType === 'collect-world-source-documents' || jobType === 'triage-world-observation-proposals') return 50
  if (jobType === 'refresh-market-screener' || jobType === 'refresh-cross-asset' || jobType === 'refresh-fmp-intelligence') return 140
  return 100
}

/** Short, bounded refreshes should not hold the sole worker for as long as an
 * intentionally long research generation. */
export function agentJobStaleAfterMs(jobType: AgentJobType, defaultStaleAfterMs = 45 * 60 * 1_000): number {
  if (jobType === 'refresh-market-screener' || jobType === 'refresh-cross-asset' || jobType === 'refresh-fmp-intelligence') return 10 * 60 * 1_000
  return defaultStaleAfterMs
}

/** Routine publications are snapshots, not a historical work queue. If an
 * earlier refresh is still queued or running, a later calendar tick can reuse
 * it; symbol-specific coverage and all governed research work stay distinct. */
export function shouldCoalesceAgentJob(jobType: AgentJobType, payload: Record<string, unknown>): boolean {
  if (jobType === 'refresh-market-screener') return payload.mode !== 'coverage' && typeof payload.symbol !== 'string'
  return jobType === 'refresh-cross-asset' || jobType === 'refresh-fmp-intelligence' || jobType === 'monitor-investment-theses'
}

interface QueuedRoutineAgentJob {
  id: string
  job_type: string
  payload: Record<string, unknown>
}

/** Preserve operational history but remove replay pressure after an outage.
 * One newest queued routine snapshot per lane remains available as a fallback
 * for a running job; coverage and governed/research jobs are never selected. */
export async function supersedeQueuedRoutineAgentJobs(now = new Date()): Promise<number> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const { data, error } = await supabase
    .from('agent_jobs')
    .select('id,job_type,payload')
    .eq('status', 'queued')
    .order('created_at', { ascending: false })
    .limit(500)
  if (error) throw new Error(`Unable to inspect queued routine jobs: ${error.message}`)
  const retainedTypes = new Set<AgentJobType>()
  const supersededIds: string[] = []
  for (const row of (data ?? []) as QueuedRoutineAgentJob[]) {
    const jobType = parseAgentJobType(row.job_type)
    if (!jobType || !shouldCoalesceAgentJob(jobType, row.payload)) continue
    if (retainedTypes.has(jobType)) supersededIds.push(row.id)
    else retainedTypes.add(jobType)
  }
  if (supersededIds.length === 0) return 0
  const { error: updateError } = await supabase.from('agent_jobs').update({
    status: 'cancelled',
    last_error: 'Superseded by newer routine snapshot work after queue backlog.',
    updated_at: now.toISOString(),
  }).in('id', supersededIds).eq('status', 'queued')
  if (updateError) throw new Error(`Unable to supersede queued routine jobs: ${updateError.message}`)
  return supersededIds.length
}

interface StaleAgentJob {
  id: string
  job_type: string
  attempts: number
  max_attempts: number
  claimed_at: string | null
}

async function recoverClaimedAgentJobs(jobs: StaleAgentJob[], now: Date, recoveryError: string): Promise<number> {
  if (jobs.length === 0) return 0
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const retryableIds = jobs.filter((job) => job.attempts < job.max_attempts).map((job) => job.id)
  const exhaustedIds = jobs.filter((job) => job.attempts >= job.max_attempts).map((job) => job.id)
  const recoveredAt = now.toISOString()
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
  if (updateError) throw new Error(`Unable to recover interrupted agent jobs: ${updateError.message}`)
  return jobs.length
}

/**
 * A fresh worker process can only reclaim jobs that the same durable worker ID
 * claimed before it stopped. This makes deployments recover promptly without
 * stealing live work from another worker process.
 */
export async function recoverInterruptedAgentJobs(workerId: string, now = new Date()): Promise<number> {
  const claimedBy = workerId.trim()
  if (!claimedBy) return 0
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const { data, error } = await supabase
    .from('agent_jobs')
    .select('id,job_type,attempts,max_attempts,claimed_at')
    .eq('status', 'running')
    .eq('claimed_by', claimedBy)
  if (error) throw new Error(`Unable to inspect interrupted agent jobs: ${error.message}`)
  return recoverClaimedAgentJobs(
    (data ?? []) as StaleAgentJob[],
    now,
    'Recovered immediately after the same worker restarted.',
  )
}

export async function recoverStaleAgentJobs(
  now = new Date(),
  defaultStaleAfterMs = 45 * 60 * 1_000,
): Promise<number> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const { data, error } = await supabase
    .from('agent_jobs')
    .select('id,job_type,attempts,max_attempts,claimed_at')
    .eq('status', 'running')
  if (error) throw new Error(`Unable to inspect stale agent jobs: ${error.message}`)
  const jobs = ((data ?? []) as StaleAgentJob[]).filter((job) => {
    const jobType = parseAgentJobType(job.job_type)
    const claimedAt = job.claimed_at ? Date.parse(job.claimed_at) : Number.NaN
    return jobType !== null && Number.isFinite(claimedAt) && claimedAt < now.getTime() - agentJobStaleAfterMs(jobType, defaultStaleAfterMs)
  })
  return recoverClaimedAgentJobs(jobs, now, 'Recovered after the worker stopped while this job was running.')
}

export async function enqueueAgentJob(
  jobType: AgentJobType,
  payload: Record<string, unknown> = {},
  dedupeKey = buildAgentJobDedupeKey(jobType, new Date(), payload),
): Promise<{ id: string; deduplicated: boolean }> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')

  if (shouldCoalesceAgentJob(jobType, payload)) {
    const { data: pending, error: pendingError } = await supabase
      .from('agent_jobs')
      .select('id')
      .eq('job_type', jobType)
      .in('status', ['queued', 'running'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (pendingError) throw new Error(`Unable to inspect active ${jobType} work: ${pendingError.message}`)
    if (pending) return { id: String(pending.id), deduplicated: true }
  }

  const { data, error } = await supabase
    .from('agent_jobs')
    .upsert({ job_type: jobType, payload, dedupe_key: dedupeKey, priority: agentJobPriority(jobType) }, { onConflict: 'dedupe_key', ignoreDuplicates: true })
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
    .insert({ job_type: jobType, payload, dedupe_key: dedupeKey, priority: agentJobPriority(jobType) })
    .select('id')
    .single()
  if (insertError || !inserted) {
    throw new Error(`Unable to enqueue agent job without the dedupe index: ${insertError?.message ?? dedupeKey}`)
  }
  return { id: inserted.id, deduplicated: false }
}

type MarketThesisCycle = 'pre-market' | 'post-close'

function validMarketThesisCycle(value: unknown): value is MarketThesisCycle {
  return value === 'pre-market' || value === 'post-close'
}

/**
 * One source adapter is intentionally reusable by both the manual adapter job
 * and the coordinated market-thesis cycle. The cycle keeps downstream work
 * in process so a baseline cannot race ahead of a still-running source fetch.
 */
async function ingestWorldSourceAdapter(adapterId: string): Promise<{
  adapterId: string
  sourceCount: number
  observationIds: string[]
  failedSources: Array<{ sourceId: string; message: string }>
}> {
  const adapter = getWorldSourceAdapter(adapterId)
  if (!adapter) throw new Error(`Unknown world-source adapter: ${adapterId}`)
  if (!(await isMarketDomainActive(adapter.domain))) {
    return { adapterId, sourceCount: 0, observationIds: [], failedSources: [{ sourceId: adapterId, message: `domain ${adapter.domain} is not active` }] }
  }
  const sourceResult = await adapter.ingest()
  const stored = []
  for (const observation of sourceResult.observations) stored.push(await ingestWorldObservation(observation))
  return {
    adapterId,
    sourceCount: sourceResult.observations.length,
    observationIds: stored.map((item) => item.id),
    failedSources: sourceResult.failures,
  }
}

/**
 * A cycle is deliberately sequential: sources -> governed collection ->
 * immutable baseline -> hypotheses -> eligible analyst/critic work. This
 * avoids a successful-looking scheduler tick that only observes stale state.
 */
async function runMarketThesisCycle(
  cycle: MarketThesisCycle,
  reportProgress: (progress: number, phase: string) => Promise<void>,
): Promise<Record<string, unknown>> {
  if (!isMarketWorldModelEnabled()) return { skipped: 'MARKET_WORLD_MODEL_ENABLED is false' }

  await reportProgress(5, 'checking governed source health')
  const health = await auditWorldSourceHealth().catch((error) => ({
    healthy: 0,
    degraded: 0,
    failed: 0,
    error: error instanceof Error ? error.message : String(error),
  }))
  const activeDomains = new Set((await fetchActiveMarketDomainPacks()).map((pack) => pack.id))
  const isSunday = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'America/New_York' }).format(new Date()) === 'Sun'
  const adapters = listWorldSourceAdapters().filter((adapter) =>
    activeDomains.has(adapter.domain) && (adapter.cadence === 'daily' || (cycle === 'post-close' && isSunday)),
  )

  const ingestions: Array<Record<string, unknown>> = []
  for (const [index, adapter] of adapters.entries()) {
    await reportProgress(10 + Math.round((index / Math.max(adapters.length, 1)) * 35), `ingesting ${adapter.label}`)
    try {
      ingestions.push(await ingestWorldSourceAdapter(adapter.id))
    } catch (error) {
      ingestions.push({ adapterId: adapter.id, error: error instanceof Error ? error.message : String(error) })
    }
  }

  await reportProgress(48, 'collecting governed source documents')
  const collection = await collectGovernedWorldSourceDocuments()
  await reportProgress(62, 'compiling the market baseline')
  const baseline = await compileWorldBaseline('global', 'global')
  await reportProgress(74, 'correlating source-backed hypotheses')
  const worldCycle = await runMarketWorldCycle({ baseline })

  await reportProgress(84, 'queuing eligible analyst and critic revisions')
  const { findDueMarketHypothesisResearch } = await import('./market-thesis-research.ts')
  const due = await findDueMarketHypothesisResearch(undefined, scheduledMarketResearchRunLimit())
  const research = await Promise.all(due.map((item) => enqueueAgentJob('deepen-market-hypothesis', item)))

  // Keep the broader planner in the same completed source cycle. Its actions
  // remain governed and durable, but cannot get ahead of this cycle's inputs.
  const { runMarketResearchOrchestration } = await import('./market-research-orchestrator.ts')
  const orchestration = await runMarketResearchOrchestration({ trigger: 'scheduled' })
  await reportProgress(100, `${adapters.length} source packets, ${due.length} eligible thesis revisions, ${orchestration.planned} governed follow-ups`)
  return {
    cycle,
    sourceAdapters: adapters.map((adapter) => adapter.id),
    ingestions,
    health,
    collection,
    baselineId: baseline.id,
    worldCycle,
    researchQueued: research.filter((item) => !item.deduplicated).length,
    researchHypothesisIds: due.map((item) => item.hypothesisId),
    orchestration,
  }
}

async function executeJob(
  job: AgentJobRecord,
  reportProgress: (progress: number, phase: string) => Promise<void> = async () => {},
): Promise<unknown> {
  if (job.job_type === 'run-market-thesis-cycle') {
    if (!validMarketThesisCycle(job.payload.cycle)) throw new Error('Market thesis cycle requires a valid cycle')
    return runMarketThesisCycle(job.payload.cycle, reportProgress)
  }

  if (job.job_type === 'sync-robinhood-portfolio') {
    const slot = job.payload.slot
    if (slot !== 'open' && slot !== 'midday' && slot !== 'close' && slot !== 'final') {
      throw new Error('Robinhood sync requires a valid capture slot')
    }
    return syncRobinhoodPortfolio(undefined, slot as RobinhoodSyncSlot)
  }

  if (job.job_type === 'sync-market-assets') {
    const client = getAlpacaClient()
    if (!client) throw new Error('Alpaca credentials are not configured')
    const assets = await syncAlpacaAssets(client)
    const expanded = await refreshExpandedMarketUniverse(assets, client, { forceRefresh: true })
    return {
      count: assets.length,
      eligibleListingCount: expanded.eligibleListingCount,
      screenerUniverseCount: expanded.selectedCount,
    }
  }

  if (job.job_type === 'prune-market-data') {
    return pruneMarketData()
  }

  if (job.job_type === 'refresh-market-screener') {
    const client = getAlpacaClient()
    if (!client) throw new Error('Alpaca credentials are not configured')
    const clock = await client.fetchClock()
    const coverageSymbol = job.payload.mode === 'coverage' && typeof job.payload.symbol === 'string'
      ? job.payload.symbol.trim().toUpperCase()
      : null
    if (!clock.isOpen && !coverageSymbol) {
      const latest = await fetchLatestSnapshotMeta()
      if (!shouldRefreshClosedMarket(latest)) {
        return { skipped: 'market_closed_recent_snapshot', nextOpen: clock.nextOpen }
      }
    }

    let assets = await fetchPersistedMarketAssets()
    if (assets.length === 0) assets = await syncAlpacaAssets(client)
    assets = await resolveMarketUniverse(assets)
    const snapshot = await materializeAlpacaScreener({ client, assets })
    const hydratePacketOwnerId = typeof job.payload.hydratePacketOwnerId === 'string'
      ? job.payload.hydratePacketOwnerId
      : null
    if (coverageSymbol && hydratePacketOwnerId) {
      await enqueueAgentJob('refresh-company-packet', {
        ownerId: hydratePacketOwnerId,
        symbol: coverageSymbol,
        reason: 'stock-open-hydration',
      })
    }
    const slot = marketMemoSlot(new Date())
    await enqueueAgentJob('generate-market-memo', {
      snapshotId: snapshot.snapshotId,
      synthesize: Boolean(slot),
      ...(slot ? { slot: slot.slot } : {}),
    })
    return snapshot
  }

  if (job.job_type === 'refresh-company-packet') {
    const symbol = typeof job.payload.symbol === 'string' ? job.payload.symbol.trim().toUpperCase() : ''
    const ownerId = typeof job.payload.ownerId === 'string' ? job.payload.ownerId : ''
    if (!/^[A-Z][A-Z0-9.-]{0,11}$/.test(symbol) || !ownerId) {
      throw new Error('Company packet refresh requires an owner and valid stock symbol')
    }
    const packet = await materializeCompanyPacket(symbol, ownerId)
    return { symbol, packetId: packet.id, dataAsOf: packet.dataAsOf }
  }

  if (job.job_type === 'refresh-fmp-intelligence') {
    return syncFmpMarketIntelligence()
  }

  if (job.job_type === 'fetch-stock-price-history') {
    const symbol = typeof job.payload.symbol === 'string' ? job.payload.symbol.trim().toUpperCase() : ''
    if (!/^[A-Z][A-Z0-9.-]{0,11}$/.test(symbol)) throw new Error('Stock price history requires a valid symbol')
    await reportProgress(20, 'fetching FMP daily prices')
    const history = await cacheFmpFiveYearPriceHistory(symbol)
    await reportProgress(100, 'cached')
    return { symbol, provider: history.provider, dataAsOf: history.dataAsOf, pointCount: history.history.length }
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
    await materializeMarketHomeSnapshot()
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
    const tradingDate = briefs[0]?.tradingDate
      ?? (typeof job.payload.tradingDate === 'string' ? job.payload.tradingDate : null)
    if (tradingDate && new Date(`${tradingDate}T12:00:00.000Z`).getUTCDay() === 5) {
      await enqueueAgentJob(
        'summarize-candidate-scout',
        { weekEnding: tradingDate },
        `summarize-candidate-scout:${tradingDate}`,
      )
    }
    return {
      candidateCount: briefs.length,
      symbols: briefs.map((brief) => brief.symbol),
      tradingDate: tradingDate ?? null,
    }
  }

  if (job.job_type === 'summarize-candidate-scout') {
    const weekEnding = typeof job.payload.weekEnding === 'string' ? job.payload.weekEnding : ''
    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekEnding)) throw new Error('Candidate weekly summary requires a week-ending date')
    return materializeCandidateWeeklySummary({ weekEnding })
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
      {
        marketThesisVersionId: typeof job.payload.marketThesisVersionId === 'string'
          ? job.payload.marketThesisVersionId
          : undefined,
      },
    )
    return { researchNoteId: note.id, symbol, version: note.version, dataAsOf: note.dataAsOf }
  }

  if (job.job_type === 'generate-etf-research') {
    const ownerId = typeof job.payload.ownerId === 'string' ? job.payload.ownerId : ''
    const symbol = typeof job.payload.symbol === 'string' ? job.payload.symbol.toUpperCase() : ''
    if (!ownerId || !symbol) throw new Error('ETF research jobs require ownerId and symbol')
    const note = await generateEtfResearch(
      symbol,
      ownerId,
      String(job.payload.reason ?? 'manual'),
      reportProgress,
    )
    return { researchNoteId: note.id, symbol, version: note.version, dataAsOf: note.dataAsOf, instrumentType: 'etf' }
  }

  if (job.job_type === 'scan-research-refreshes') {
    return scanResearchRefreshes()
  }

  if (job.job_type === 'seed-portfolio-company-research') {
    // This deliberately queues research, never an investment thesis, sizing,
    // or action. Existing exposure earns first pass; FMP peers are merely a
    // bounded adjacent-company discovery lane.
    const requestedOwnerId = typeof job.payload.ownerId === 'string' ? job.payload.ownerId : null
    const ownerIds = requestedOwnerId ? [requestedOwnerId] : await fetchPortfolioResearchSeedOwners()
    const results = []
    for (const ownerId of ownerIds) {
      const coverage = await fetchPortfolioResearchCoverage(ownerId, { maxTargets: 4 })
      const queued = await Promise.all(coverage.targets.map(async (target) => {
        const context = target.relatedTo.length > 0 ? ` related to ${target.relatedTo.join(', ')}` : ''
        return enqueueAgentJob('generate-company-research', {
          ownerId,
          symbol: target.symbol,
          reason: `${target.reason}${context}`,
          researchPriority: target.priority,
          relatedSymbols: target.relatedTo,
        })
      }))
      results.push({
        ownerId,
        ownedCount: coverage.ownedSymbols.length,
        watchlistedCount: coverage.watchlistedSymbols.length,
        adjacentCount: coverage.adjacentSymbols.length,
        targetSymbols: coverage.targets.map((target) => target.symbol),
        queued: queued.filter((item) => !item.deduplicated).length,
      })
    }
    return { owners: results, note: 'Portfolio-led research only; no thesis, trade, or portfolio action was created.' }
  }

  if (job.job_type === 'monitor-investment-theses') {
    return monitorInvestmentTheses()
  }

  if (job.job_type === 'ingest-world-source') {
    const adapterId = typeof job.payload.adapterId === 'string' ? job.payload.adapterId : ''
    if (adapterId) {
      const adapter = getWorldSourceAdapter(adapterId)
      if (!adapter) throw new Error(`Unknown world-source adapter: ${adapterId}`)
      if (!(await isMarketDomainActive(adapter.domain))) return { adapterId, skipped: `domain ${adapter.domain} is not active` }
      await reportProgress(10, `fetching ${adapter.label}`)
      const sourceResult = await ingestWorldSourceAdapter(adapterId)
      await reportProgress(55, 'archiving source documents and observations')
      await reportProgress(100, 'ingested')
      if (isMarketWorldModelEnabled() && sourceResult.observationIds.length > 0) {
        // A source can partially succeed and then later supply the decisive
        // document. Tie downstream work to the observation set, not merely the
        // calendar day, so that recovery is visible in the next baseline.
        const evidenceFingerprint = [...sourceResult.observationIds].sort().join('-')
        await enqueueAgentJob('compile-world-baseline', { scopeType: 'domain', scopeKey: adapter.domain, evidenceFingerprint })
        await enqueueAgentJob('compile-world-baseline', { scopeType: 'global', scopeKey: 'global', evidenceFingerprint })
        await enqueueAgentJob('synthesize-market-hypotheses', { reason: `source:${adapterId}`, evidenceFingerprint })
      }
      return sourceResult
    }
    const payload = job.payload.observation
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('World-source ingestion requires an observation payload')
    return ingestWorldObservation(payload as Parameters<typeof ingestWorldObservation>[0])
  }

  if (job.job_type === 'verify-world-source-health') {
    await reportProgress(5, 'probing approved source contracts')
    const audit = await auditWorldSourceHealth()
    await reportProgress(100, `${audit.healthy} healthy, ${audit.degraded} degraded, ${audit.failed} failed`)
    return { checked: audit.checks.length, healthy: audit.healthy, degraded: audit.degraded, failed: audit.failed }
  }

  if (job.job_type === 'preflight-world-source-candidate') {
    const slug = typeof job.payload.slug === 'string' ? job.payload.slug.trim().toLowerCase() : ''
    if (!slug) throw new Error('Candidate preflight requires a source slug')
    await reportProgress(5, 'probing the candidate direct target')
    const check = await preflightWorldSourceCandidate(slug)
    await reportProgress(100, `${check.status} candidate target check recorded`)
    return { sourceId: check.sourceId, slug, status: check.status, resolvedUrl: check.resolvedUrl, mimeType: check.mimeType }
  }

  if (job.job_type === 'collect-world-source-documents') {
    await reportProgress(5, 'collecting bounded governed source documents')
    const result = await collectGovernedWorldSourceDocuments()
    if (result.captureIds.length > 0) await enqueueAgentJob('triage-world-observation-proposals', { captureIds: result.captureIds })
    await reportProgress(100, `${result.captured} captured, ${result.rejected} rejected, ${result.failed} failed`)
    return result
  }

  if (job.job_type === 'triage-world-observation-proposals') {
    const captureIds = Array.isArray(job.payload.captureIds) ? job.payload.captureIds.filter((item): item is string => typeof item === 'string') : undefined
    await reportProgress(5, 'creating quote-verified observation proposals')
    const result = await triageCapturedWorldObservationProposals({ captureIds })
    await reportProgress(100, `${result.proposals} reviewable proposals from ${result.documents} documents; ${result.failures.length} isolated failures`)
    return result
  }

  if (job.job_type === 'scout-world-sources') {
    const domainId = typeof job.payload.domainId === 'string' ? job.payload.domainId : ''
    const reason = typeof job.payload.reason === 'string' ? job.payload.reason : ''
    const trigger = job.payload.trigger === 'bootstrap' || job.payload.trigger === 'frontier_gap' || job.payload.trigger === 'coverage_review'
      ? job.payload.trigger
      : 'manual'
    const frontierIds = Array.isArray(job.payload.frontierIds)
      ? job.payload.frontierIds.filter((item): item is string => typeof item === 'string')
      : []
    if (!domainId || !reason) throw new Error('World-source scout requires a domain and reason')
    await reportProgress(5, 'scouting bounded source candidates')
    const run = await runWorldSourceScout({ domainId, reason, trigger, frontierIds })
    // Preflight records only direct-target reachability and contract shape. It
    // cannot approve, ingest, activate a domain, or otherwise change source
    // authority; the reviewer remains the sole admission gate.
    const preflightSlugs = await findCandidateSourcePreflights(run.candidates.map((candidate) => candidate.slug))
    const preflights = await Promise.all(preflightSlugs.map((slug) => enqueueAgentJob('preflight-world-source-candidate', {
      slug, trigger: 'scout-follow-up', discoveryRunId: run.id,
    })))
    await reportProgress(100, 'candidate sources preserved and direct targets queued for preflight')
    return {
      discoveryRunId: run.id, domainId: run.domainId, candidateCount: run.candidates.length, status: run.status,
      preflightQueued: preflights.filter((item) => !item.deduplicated).length,
      preflightDeduplicated: preflights.filter((item) => item.deduplicated).length,
    }
  }

  if (job.job_type === 'scout-market-research') {
    const domainId = typeof job.payload.domainId === 'string' ? job.payload.domainId : ''
    const reason = typeof job.payload.reason === 'string' ? job.payload.reason : ''
    const frontierIds = Array.isArray(job.payload.frontierIds)
      ? job.payload.frontierIds.filter((item): item is string => typeof item === 'string') : []
    if (!domainId || !reason) throw new Error('Broad research scout requires a domain and reason')
    await reportProgress(5, 'investigating broad, citation-required research leads')
    const run = await runMarketResearchScout({ domainId, reason, frontierIds, trigger: job.payload.trigger === 'frontier_gap' ? 'frontier_gap' : 'manual' })
    await reportProgress(100, `${run.leads.length} provisional leads; no source contract or market evidence was auto-created`)
    return { researchScoutRunId: run.id, domainId, leadCount: run.leads.length, unresolvedQuestions: run.unresolvedQuestions.length }
  }

  if (job.job_type === 'review-world-source-coverage') {
    const plans = await findWorldSourceCoverageScoutPlans()
    const queued = await Promise.all(plans.map((plan) => enqueueAgentJob('scout-world-sources', {
      domainId: plan.domainId, reason: plan.reason, trigger: 'coverage_review',
    })))
    return { planned: plans.length, queued: queued.filter((item) => !item.deduplicated).length, domainIds: plans.map((plan) => plan.domainId) }
  }

  if (job.job_type === 'scan-intelligence-source-referrals') {
    await reportProgress(5, 'scanning existing Intelligence and Markets feed records for bounded source referrals')
    const result = await materializeIntelligenceSourceReferrals()
    await reportProgress(100, `${result.created} pending referrals from ${result.scanned} recent feed records; none were admitted as evidence`)
    return result
  }

  if (job.job_type === 'compile-world-baseline') {
    const scopeType = job.payload.scopeType === 'domain' ? 'domain' : 'global'
    const scopeKey = typeof job.payload.scopeKey === 'string' ? job.payload.scopeKey : 'global'
    return compileWorldBaseline(scopeType, scopeKey)
  }

  if (job.job_type === 'correlate-market-signals') {
    if (!isMarketWorldModelEnabled()) return { skipped: 'MARKET_WORLD_MODEL_ENABLED is false' }
    const result = await runMarketWorldCycle()
    return { ...result, automaticPromotionEnabled: isMarketAutoThesisEnabled() }
  }

  if (job.job_type === 'synthesize-market-hypotheses') {
    if (!isMarketWorldModelEnabled()) return { skipped: 'MARKET_WORLD_MODEL_ENABLED is false' }
    const result = await runMarketWorldCycle()
    const { findDueMarketHypothesisResearch } = await import('./market-thesis-research.ts')
    const scheduledResearchLimit = scheduledMarketResearchRunLimit()
    const due = await findDueMarketHypothesisResearch(typeof job.payload.ownerId === 'string' ? job.payload.ownerId : undefined, scheduledResearchLimit)
    const queued = await Promise.all(due.map((item) => enqueueAgentJob('deepen-market-hypothesis', item)))
    return { ...result, queuedResearch: queued.length, scheduledResearchLimit }
  }

  if (job.job_type === 'deepen-market-hypothesis') {
    const ownerId = typeof job.payload.ownerId === 'string' ? job.payload.ownerId : ''
    const hypothesisId = typeof job.payload.hypothesisId === 'string' ? job.payload.hypothesisId : ''
    if (!ownerId || !hypothesisId) throw new Error('Market research requires ownerId and hypothesisId')
    const { deepenMarketHypothesis } = await import('./market-thesis-research.ts')
    await reportProgress(5, 'loading bounded source ledger')
    const research = await deepenMarketHypothesis({ ownerId, hypothesisId, reason: typeof job.payload.reason === 'string' ? job.payload.reason : 'scheduled deepening' })
    const { promoteEligibleMarketHypothesis, shouldAutoPromoteMarketResearch } = await import('./world-memory.ts')
    const autoPromotionEnabled = shouldAutoPromoteMarketResearch(research.status)
    await reportProgress(100, research.status === 'complete'
      ? (autoPromotionEnabled ? 'validated research published' : 'validated research awaits promotion authorization')
      : 'research requires revision')
    const marketThesis = autoPromotionEnabled ? await promoteEligibleMarketHypothesis(ownerId, hypothesisId) : null
    return { hypothesisId, researchVersionId: research.id, version: research.version, status: research.status, marketThesisId: marketThesis?.id ?? null }
  }

  if (job.job_type === 'refresh-market-hypothesis-research') {
    const { findDueMarketHypothesisResearch } = await import('./market-thesis-research.ts')
    const scheduledResearchLimit = scheduledMarketResearchRunLimit()
    const requestedIds = Array.isArray(job.payload.hypothesisIds)
      ? new Set(job.payload.hypothesisIds.filter((item): item is string => typeof item === 'string'))
      : null
    const candidates = await findDueMarketHypothesisResearch(undefined, requestedIds ? 40 : scheduledResearchLimit)
    const due = requestedIds
      ? candidates.filter((item) => requestedIds.has(item.hypothesisId)).slice(0, scheduledResearchLimit)
      : candidates
    const queued = await Promise.all(due.map((item) => enqueueAgentJob('deepen-market-hypothesis', item)))
    return { queued: queued.length, hypothesisIds: due.map((item) => item.hypothesisId), requestedHypothesisIds: requestedIds ? [...requestedIds] : null, scheduledResearchLimit }
  }

  if (job.job_type === 'route-market-research-frontiers') {
    const { deferResearchFrontiersForScout, findQueuedResearchFrontierScoutPlans } = await import('./market-thesis-research.ts')
    const plans = await findQueuedResearchFrontierScoutPlans()
    const results = []
    for (const plan of plans) {
      const queued = await enqueueAgentJob('scout-market-research', {
        domainId: plan.domainId, reason: plan.reason, trigger: 'frontier_gap', frontierIds: plan.frontierIds,
      })
      // A same-day broad research pass may already cover this exact frontier.
      // These frontiers remain unresolved until independent governed evidence
      // is accepted; a lead dossier is deliberately not an evidence completion.
      if (!queued.deduplicated) await deferResearchFrontiersForScout(plan.frontierIds, queued.id)
      results.push({ domainId: plan.domainId, frontierCount: plan.frontierIds.length, ...queued })
    }
    return { planned: plans.length, queued: results.filter((item) => !item.deduplicated).length, results }
  }

  if (job.job_type === 'orchestrate-market-research') {
    const { runMarketResearchOrchestration } = await import('./market-research-orchestrator.ts')
    await reportProgress(5, 'reading governed evidence, frontier, and lead signals across active domains')
    const result = await runMarketResearchOrchestration({ trigger: job.payload.trigger === 'manual' ? 'manual' : 'scheduled' })
    await reportProgress(100, `${result.planned} durable actions planned; ${result.enqueued} worker jobs enqueued; ${result.autoAccepted} auto-accepted; ${result.awaitingReview} review waits; ${result.deferred} budget-deferred`)
    return result
  }

  if (job.job_type === 'auto-accept-observation-proposals') {
    const { autoAcceptEligibleWorldObservationProposals } = await import('./world-observation-review.ts')
    await reportProgress(5, 're-checking quote-bound proposals against worker corpus extracts')
    const result = await autoAcceptEligibleWorldObservationProposals({
      domainId: typeof job.payload.domainId === 'string' ? job.payload.domainId : undefined,
      limit: typeof job.payload.limit === 'number' ? job.payload.limit : 40,
    })
    if (result.accepted > 0) {
      await enqueueAgentJob('synthesize-market-hypotheses', {
        reason: `policy auto-accept:${result.accepted}`,
        evidenceFingerprint: result.observationIds[0] ?? 'auto-accept',
      })
    }
    await reportProgress(100, `${result.accepted} accepted; ${result.failed} failed checks; ${Object.values(result.remainingByDomain).reduce((sum, count) => sum + count, 0)} still awaiting human review`)
    return result
  }

  if (job.job_type === 'evaluate-market-prediction') {
    const predictionId = typeof job.payload.predictionId === 'string' ? job.payload.predictionId : ''
    if (!predictionId) throw new Error('Prediction evaluation requires a prediction ID')
    await reportProgress(5, 'loading post-prediction evidence')
    const result = await evaluateMarketPrediction({ predictionId })
    if (result.evaluation.verdict === 'disconfirmed') {
      await enqueueAgentJob('deepen-market-hypothesis', {
        ownerId: result.ownerId, hypothesisId: result.hypothesisId,
        reason: `prediction disconfirmed: ${predictionId}`,
      })
    }
    await reportProgress(100, `prediction evaluation ${result.evaluation.verdict}`)
    return { predictionId, evaluationId: result.evaluation.id, verdict: result.evaluation.verdict, hypothesisId: result.hypothesisId }
  }

  if (job.job_type === 'evaluate-market-predictions') {
    const predictionIds = await findDueMarketPredictionEvaluations()
    const queued = await Promise.all(predictionIds.map((predictionId) => enqueueAgentJob('evaluate-market-prediction', { predictionId })))
    return { queued: queued.length, predictionIds }
  }

  if (job.job_type === 'monitor-market-theses') {
    if (!isMarketWorldModelEnabled()) return { skipped: 'MARKET_WORLD_MODEL_ENABLED is false' }
    return runMarketWorldCycle()
  }

  if (job.job_type === 'backup-market-corpus') return backupMarketCorpus()
  if (job.job_type === 'verify-market-corpus') return verifyMarketCorpusBackup()

  if (job.job_type === 'generate-market-memo') {
    const snapshotId = typeof job.payload.snapshotId === 'string'
      ? job.payload.snapshotId
      : (await fetchLatestSnapshotMeta())?.id
    if (!snapshotId) throw new Error('No completed market snapshot is available')
    return materializeMarketMemo(snapshotId, { synthesize: job.payload.synthesize !== false })
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
  const provider = job.job_type === 'generate-market-memo' && job.payload.synthesize === false
    ? 'market-data'
    : agentJobProvider(job.job_type)
  const modelRouting = marketModelRoutingForAgentJob(job.job_type)
  const model = modelForAgentJob(job.job_type)
  const { data: run, error: runError } = await supabase
    .from('agent_runs')
    .insert({
      job_id: job.id, worker_id: workerId, status: 'running', provider, model,
      input_refs: [job.payload, ...(modelRouting.length > 0 ? [{ marketModelRouting: modelRouting }] : [])],
    })
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
  const fmpUsageBefore = getFmpUsageSnapshot()

  try {
    const output = outputWithUsage(
      await executeJob(job, reportProgress),
      fmpUsageBefore,
      getFmpUsageSnapshot(),
    )
    await Promise.all([
      supabase.from('agent_runs').update({
        status: 'succeeded', output, finished_at: new Date().toISOString(), duration_ms: Date.now() - startedAt,
      }).eq('id', run.id),
      // A retried job can recover. Its current terminal state must not carry a
      // prior attempt's failure forward as though the latest run still failed.
      supabase.from('agent_jobs').update({ status: 'succeeded', last_error: null, updated_at: new Date().toISOString() }).eq('id', job.id),
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

/** Drain up to `concurrency` jobs in parallel. Used by the macserver worker so
 * cheap/standard orchestration children can progress together without opening
 * an unbounded multi-process farm. */
export async function processAgentJobs(workerId: string, concurrency = 1): Promise<number> {
  const slots = Math.max(1, Math.min(4, Math.floor(concurrency)))
  const results = await Promise.all(Array.from({ length: slots }, () => processOneAgentJob(workerId)))
  return results.filter(Boolean).length
}
