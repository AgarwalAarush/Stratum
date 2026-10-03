import { AI_MODELS, ownershipResearchModel } from '../ai/config.ts'
import { isOwnershipResearchJob } from './agent-attempt-environment.ts'
import { selectMarketModel, type MarketModelSelection } from './market-model-policy.ts'

export const AGENT_JOB_TYPES = [
  'review-recommendation-trade',
  'generate-daily-recommendations',
  'evaluate-recommendation-outcomes',
  'review-recommendation-cohort',
  'send-investment-newsletter',
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
  'generate-daily-overview',
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
  'refresh-world-events',
  'refresh-world-benchmark',
  'run-world-replay',
  'run-world-thinker',
  'project-world-repository',
] as const

/** Queue producers can attach durable input references alongside these known fields.
 * Fields stay optional at enqueue time for existing scheduled and legacy callers;
 * handlers validate the fields required to execute their own job. */
type JobPayload = Record<string, unknown>
type OwnedPayload = JobPayload & { ownerId?: string; reason?: string }
type ResearchPayload = OwnedPayload & {
  symbol?: string | null
  eventId?: string | null
  forceFullResearch?: boolean
  worldOpportunityLeadId?: string
  marketThesisVersionId?: string
  instrumentType?: string
}
type CadencePayload = JobPayload & { cadenceMinutes?: number }
type ScoutPayload = JobPayload & { domainId?: string; reason?: string; trigger?: string; frontierIds?: string[] }
type BaselinePayload = JobPayload & { scopeType?: 'domain' | 'global'; scopeKey?: string; evidenceFingerprint?: string }

export interface AgentJobPayloadMap {
  'review-recommendation-trade': JobPayload & { instruction?: string }
  'generate-daily-recommendations': OwnedPayload & { editionKey?: string; phase?: string; dependencyJobIds?: string[] }
  'evaluate-recommendation-outcomes': JobPayload
  'review-recommendation-cohort': JobPayload
  'send-investment-newsletter': JobPayload
  'sync-market-assets': JobPayload
  'sync-robinhood-portfolio': JobPayload & { tradingDate?: string; slot?: 'open' | 'midday' | 'close' | 'final' }
  'refresh-market-screener': JobPayload & { mode?: string; symbol?: string; hydratePacketOwnerId?: string }
  'prune-market-data': JobPayload
  'refresh-cross-asset': JobPayload & { mode?: string }
  'materialize-market-leadership': JobPayload & { tradingDate?: string }
  'run-candidate-scout': JobPayload & { tradingDate?: string; symbols?: string[]; leadershipSnapshotId?: string; marketSnapshotId?: string; reason?: string }
  'summarize-candidate-scout': JobPayload & { weekEnding?: string }
  'refresh-company-packet': ResearchPayload
  'generate-company-research': ResearchPayload
  'generate-etf-research': ResearchPayload
  'event-refresh-company-research': ResearchPayload
  'scan-research-refreshes': CadencePayload
  'seed-portfolio-company-research': OwnedPayload
  'monitor-investment-theses': CadencePayload
  'refresh-fmp-intelligence': CadencePayload
  'fetch-stock-price-history': JobPayload & { symbol?: string }
  'generate-market-memo': JobPayload & { snapshotId?: string; synthesize?: boolean; slot?: string }
  'generate-daily-overview': JobPayload & { scope?: string }
  'generate-morning-brief': JobPayload
  'generate-weekly-overview': JobPayload
  'generate-monthly-overview': JobPayload
  'ingest-world-source': JobPayload & { adapterId?: string; observation?: object; fingerprint?: string }
  'run-market-thesis-cycle': JobPayload & { cycle?: 'pre-market' | 'post-close'; cycleDate?: string }
  'verify-world-source-health': JobPayload
  'preflight-world-source-candidate': JobPayload & { slug?: string; trigger?: string; discoveryRunId?: string }
  'collect-world-source-documents': JobPayload
  'triage-world-observation-proposals': JobPayload & { captureIds?: string[] }
  'auto-accept-observation-proposals': JobPayload & { domainId?: string; limit?: number }
  'scout-market-research': ScoutPayload
  'scout-world-sources': ScoutPayload
  'review-world-source-coverage': JobPayload & { trigger?: string; domainIds?: string[] }
  'scan-intelligence-source-referrals': JobPayload
  'compile-world-baseline': BaselinePayload
  'correlate-market-signals': BaselinePayload
  'synthesize-market-hypotheses': BaselinePayload & { ownerId?: string }
  'deepen-market-hypothesis': OwnedPayload & { hypothesisId?: string }
  'refresh-market-hypothesis-research': JobPayload & { hypothesisIds?: string[] }
  'route-market-research-frontiers': JobPayload
  'orchestrate-market-research': JobPayload & { trigger?: string }
  'evaluate-market-prediction': JobPayload & { predictionId?: string; trigger?: string }
  'evaluate-market-predictions': JobPayload
  'monitor-market-theses': BaselinePayload
  'backup-market-corpus': JobPayload
  'verify-market-corpus': JobPayload
  'refresh-world-events': JobPayload & { runThinkerAfter?: boolean; reason?: string; evidenceFingerprint?: string; since?: string; until?: string }
  'refresh-world-benchmark': JobPayload
  'run-world-replay': JobPayload & { replayRunId?: string; since?: string; until?: string; model?: boolean; cursorAt?: string; step?: string; resumeAttempt?: number }
  'run-world-thinker': JobPayload & {
    trigger?: 'scheduled' | 'urgent' | 'manual' | 'backfill' | 'company_research'
    eventClusterIds?: string[]
    coverageFrontierIds?: string[]
    coverageFrontierId?: string
    legacyHypothesisId?: string
    ownerReviewItemId?: string
    worldOpportunityLeadId?: string
    researchNoteId?: string
    symbol?: string
  }
  'project-world-repository': JobPayload & { commit?: string }
}

export type AgentJobType = typeof AGENT_JOB_TYPES[number]
export type AgentJobPayload<T extends AgentJobType = AgentJobType> = AgentJobPayloadMap[T]
export type AgentJobProvider = 'alpaca' | 'fmp' | 'codex' | 'market-data' | 'robinhood'
export type AgentJobRecord<T extends AgentJobType = AgentJobType> = {
  [K in T]: { id: string; job_type: K; payload: AgentJobPayloadMap[K]; attempts: number; max_attempts: number }
}[T]
export type AgentJobProgress = (progress: number, phase: string) => Promise<void>
export type AgentJobHandler<T extends AgentJobType = AgentJobType> = (job: AgentJobRecord<T>, reportProgress: AgentJobProgress) => Promise<unknown>
export type AgentJobHandlers = { [T in AgentJobType]: AgentJobHandler<T> }

type PayloadField = 'string' | 'strings' | 'boolean' | 'number' | 'object' | 'coercedString' | 'coercedNumber' | readonly string[]
type PayloadFieldFor<T> = NonNullable<T> extends string[] ? 'strings'
  : NonNullable<T> extends string ? 'string' | 'coercedString' | readonly NonNullable<T>[]
  : NonNullable<T> extends boolean ? 'boolean'
  : NonNullable<T> extends number ? 'number' | 'coercedNumber'
  : 'object'
type KnownPayloadFields<T> = {
  [K in keyof T as string extends K ? never : number extends K ? never : K]-?: PayloadFieldFor<T[K]>
}
type PayloadFieldMap = { [T in AgentJobType]: KnownPayloadFields<AgentJobPayloadMap[T]> }
const ownerFields = { ownerId: 'string', reason: 'coercedString' } as const
const researchFields = {
  ...ownerFields,
  symbol: 'string', eventId: 'string', forceFullResearch: 'boolean',
  worldOpportunityLeadId: 'string', marketThesisVersionId: 'string', instrumentType: 'string',
} as const
const scoutFields = { domainId: 'string', reason: 'string', trigger: 'string', frontierIds: 'strings' } as const
const baselineFields = { scopeType: ['domain', 'global'], scopeKey: 'string', evidenceFingerprint: 'string' } as const
const cadenceFields = { cadenceMinutes: 'number' } as const

/** Mirrors the existing handlers' optional-field defaults. Unknown metadata stays
 * attached to the job; known fields are narrowed before a typed handler sees them.
 * Required business inputs are still checked by the handler with its existing error. */
const PAYLOAD_FIELDS: PayloadFieldMap = {
  'review-recommendation-trade': { instruction: 'coercedString' },
  'generate-daily-recommendations': { ...ownerFields, editionKey: 'string', phase: 'string', dependencyJobIds: 'strings' },
  'evaluate-recommendation-outcomes': {},
  'review-recommendation-cohort': {},
  'send-investment-newsletter': {},
  'sync-market-assets': {},
  'sync-robinhood-portfolio': { tradingDate: 'string', slot: ['open', 'midday', 'close', 'final'] },
  'refresh-market-screener': { mode: 'string', symbol: 'string', hydratePacketOwnerId: 'string' },
  'prune-market-data': {},
  'refresh-cross-asset': { mode: 'string' },
  'materialize-market-leadership': { tradingDate: 'string' },
  'run-candidate-scout': { tradingDate: 'string', symbols: 'strings', leadershipSnapshotId: 'string', marketSnapshotId: 'string', reason: 'string' },
  'summarize-candidate-scout': { weekEnding: 'string' },
  'refresh-company-packet': researchFields,
  'generate-company-research': researchFields,
  'generate-etf-research': researchFields,
  'event-refresh-company-research': researchFields,
  'scan-research-refreshes': cadenceFields,
  'seed-portfolio-company-research': ownerFields,
  'monitor-investment-theses': cadenceFields,
  'refresh-fmp-intelligence': cadenceFields,
  'fetch-stock-price-history': { symbol: 'string' },
  'generate-market-memo': { snapshotId: 'string', synthesize: 'boolean', slot: 'string' },
  'generate-daily-overview': { scope: 'string' },
  'generate-morning-brief': {},
  'generate-weekly-overview': {},
  'generate-monthly-overview': {},
  'ingest-world-source': { adapterId: 'string', observation: 'object', fingerprint: 'string' },
  'run-market-thesis-cycle': { cycle: ['pre-market', 'post-close'], cycleDate: 'string' },
  'verify-world-source-health': {},
  'preflight-world-source-candidate': { slug: 'string', trigger: 'string', discoveryRunId: 'string' },
  'collect-world-source-documents': {},
  'triage-world-observation-proposals': { captureIds: 'strings' },
  'auto-accept-observation-proposals': { domainId: 'string', limit: 'number' },
  'scout-market-research': scoutFields,
  'scout-world-sources': scoutFields,
  'review-world-source-coverage': { trigger: 'string', domainIds: 'strings' },
  'scan-intelligence-source-referrals': {},
  'compile-world-baseline': baselineFields,
  'correlate-market-signals': baselineFields,
  'synthesize-market-hypotheses': { ...baselineFields, ownerId: 'string' },
  'deepen-market-hypothesis': { ...ownerFields, hypothesisId: 'string' },
  'refresh-market-hypothesis-research': { hypothesisIds: 'strings' },
  'route-market-research-frontiers': {},
  'orchestrate-market-research': { trigger: 'string' },
  'evaluate-market-prediction': { predictionId: 'string', trigger: 'string' },
  'evaluate-market-predictions': {},
  'monitor-market-theses': baselineFields,
  'backup-market-corpus': {},
  'verify-market-corpus': {},
  'refresh-world-events': { runThinkerAfter: 'boolean', reason: 'string', evidenceFingerprint: 'string', since: 'string', until: 'string' },
  'refresh-world-benchmark': {},
  'run-world-replay': { replayRunId: 'string', since: 'string', until: 'string', model: 'boolean', cursorAt: 'string', step: 'string', resumeAttempt: 'coercedNumber' },
  'run-world-thinker': {
    trigger: ['scheduled', 'urgent', 'manual', 'backfill', 'company_research'],
    eventClusterIds: 'strings', coverageFrontierIds: 'strings', coverageFrontierId: 'string',
    legacyHypothesisId: 'string', ownerReviewItemId: 'string', worldOpportunityLeadId: 'string', researchNoteId: 'string', symbol: 'string',
  },
  'project-world-repository': { commit: 'string' },
}

function narrowPayloadField(value: unknown, field: PayloadField): unknown {
  if (Array.isArray(field)) return typeof value === 'string' && field.includes(value) ? value : undefined
  if (field === 'strings') return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : undefined
  if (field === 'object') return value && typeof value === 'object' && !Array.isArray(value) ? value : undefined
  if (field === 'coercedString') return value === null || value === undefined ? undefined : String(value)
  if (field === 'coercedNumber') return value === null || value === undefined ? undefined : Number(value)
  return typeof value === field ? value : undefined
}

export function parseAgentJobPayload<T extends AgentJobType>(jobType: T, value: unknown): AgentJobPayload<T> {
  parseAgentJobType(jobType)
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Agent job payload must be an object')
  const payload: JobPayload = { ...value }
  for (const [key, field] of Object.entries(PAYLOAD_FIELDS[jobType])) {
    const narrowed = narrowPayloadField(payload[key], field as PayloadField)
    if (narrowed === undefined) delete payload[key]
    else payload[key] = narrowed
  }
  return payload as AgentJobPayload<T>
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
  if (['generate-daily-recommendations','evaluate-recommendation-outcomes','review-recommendation-cohort','send-investment-newsletter'].includes(jobType)) return `${jobType}:${now.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })}`
  if (jobType === 'generate-daily-overview') return `${jobType}:${now.toISOString().slice(0, 10)}:${String(payload.scope ?? 'ai-research')}`
  if (jobType === 'refresh-world-events') {
    const bucket = new Date(now)
    bucket.setUTCMinutes(Math.floor(bucket.getUTCMinutes() / 15) * 15, 0, 0)
    return `${jobType}:${bucket.toISOString()}`
  }
  if (jobType === 'run-world-thinker') {
    if (payload.trigger === 'company_research' && typeof payload.researchNoteId === 'string') return `${jobType}:company-research:${payload.researchNoteId}`
    const minutes = payload.trigger === 'urgent' ? 20 : 12 * 60
    const bucket = new Date(now)
    bucket.setTime(Math.floor(bucket.getTime() / (minutes * 60_000)) * minutes * 60_000)
    return `${jobType}:${payload.trigger === 'urgent' ? 'urgent' : String(payload.trigger ?? 'scheduled')}:${bucket.toISOString()}`
  }
  if (jobType === 'run-world-replay') {
    if (typeof payload.replayRunId === 'string') return `${jobType}:${payload.replayRunId}:${String(payload.cursorAt ?? 'next')}:${String(payload.step ?? 'start')}:${String(payload.resumeAttempt ?? 0)}`
    return `${jobType}:${now.toISOString().slice(0, 10)}`
  }
  if (jobType === 'project-world-repository' && typeof payload.commit === 'string') return `${jobType}:${payload.commit}`
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
  if (['evaluate-recommendation-outcomes','review-recommendation-cohort','send-investment-newsletter'].includes(jobType)) return 'market-data'
  if (jobType === 'sync-robinhood-portfolio') return 'robinhood'
  if (jobType === 'sync-market-assets' || jobType === 'refresh-market-screener') return 'alpaca'
  if (jobType === 'refresh-fmp-intelligence' || jobType === 'fetch-stock-price-history' || jobType === 'run-candidate-scout' || jobType === 'refresh-company-packet') return 'fmp'
  if (jobType === 'project-world-repository' || jobType === 'run-world-replay' || jobType === 'refresh-world-benchmark') return 'market-data'
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
  const tasks = jobType === 'refresh-world-events'
    ? ['world_event_extraction'] as const
    : jobType === 'run-world-thinker'
      ? ['world_thinker', 'world_critic'] as const
      : jobType === 'scout-world-sources'
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
  if (isOwnershipResearchJob(jobType)) return ownershipResearchModel(environment)
  const routed = marketModelRoutingForAgentJob(jobType, environment)
  if (routed.length > 0) return routed[0]!.model
  return agentJobProvider(jobType) === 'codex'
    ? environment.CODEX_SYNTHESIS_MODEL ?? AI_MODELS.scheduledSynthesis
    : null
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
  if(jobType==='review-recommendation-trade') return 5
  if (jobType === 'sync-robinhood-portfolio') return 6
  if (jobType === 'send-investment-newsletter') return 5
  if (jobType === 'generate-daily-recommendations') return 10
  if (jobType === 'evaluate-recommendation-outcomes' || jobType === 'review-recommendation-cohort') return 15
  if (jobType === 'run-world-thinker') return 25
  if (jobType === 'run-world-replay') return 70
  if (jobType === 'refresh-world-benchmark') return 80
  if (jobType === 'refresh-world-events' || jobType === 'project-world-repository') return 35
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
  if (jobType === 'run-world-thinker') return 35 * 60 * 1_000
  if (jobType === 'run-world-replay') return 45 * 60 * 1_000
  if (jobType === 'refresh-market-screener' || jobType === 'refresh-cross-asset' || jobType === 'refresh-fmp-intelligence') return 10 * 60 * 1_000
  return defaultStaleAfterMs
}

/** Routine publications are snapshots, not a historical work queue. If an
 * earlier refresh is still queued or running, a later calendar tick can reuse
 * it; symbol-specific coverage and all governed research work stay distinct. */
export function shouldCoalesceAgentJob(jobType: AgentJobType, payload: Record<string, unknown>): boolean {
  if (jobType === 'refresh-world-events') return Object.keys(payload).length === 0
  if (jobType === 'refresh-market-screener') return payload.mode !== 'coverage' && typeof payload.symbol !== 'string'
  return jobType === 'refresh-cross-asset' || jobType === 'refresh-fmp-intelligence' || jobType === 'monitor-investment-theses'
}
