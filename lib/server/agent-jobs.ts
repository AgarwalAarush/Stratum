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
import { getWorldSourceAdapter } from './world-sources.ts'
import { runWorldSourceScout } from './world-source-control.ts'
import { AI_MODELS } from '../ai/config.ts'
import { selectMarketModel } from './market-model-policy.ts'
import {
  fetchPersistedMarketAssets,
  materializeAlpacaScreener,
  syncAlpacaAssets,
} from './markets-ingestion.ts'
import { fetchLatestSnapshotMeta } from './markets-repository.ts'
import { getSupabaseClient } from './supabase.ts'

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
  'monitor-investment-theses',
  'refresh-fmp-intelligence',
  'fetch-stock-price-history',
  'generate-market-memo',
  'generate-morning-brief',
  'generate-weekly-overview',
  'generate-monthly-overview',
  'ingest-world-source',
  'scout-world-sources',
  'compile-world-baseline',
  'correlate-market-signals',
  'synthesize-market-hypotheses',
  'deepen-market-hypothesis',
  'refresh-market-hypothesis-research',
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
  if (jobType === 'backup-market-corpus' || jobType === 'verify-market-corpus') return `${jobType}:${now.toISOString().slice(0, 10)}`
  if (jobType === 'ingest-world-source') {
    if (typeof payload.fingerprint === 'string') return `${jobType}:${payload.fingerprint}`
    if (typeof payload.adapterId === 'string') return `${jobType}:${payload.adapterId}:${now.toISOString().slice(0, 10)}`
  }
  if (jobType === 'scout-world-sources' && typeof payload.domainId === 'string') {
    return `${jobType}:${payload.domainId}:${now.toISOString().slice(0, 10)}`
  }
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
  if (jobType === 'ingest-world-source') return 'market-data'
  if (
    jobType === 'refresh-cross-asset'
    || jobType === 'materialize-market-leadership'
    || jobType === 'scan-research-refreshes'
    || jobType === 'monitor-investment-theses'
    || jobType === 'summarize-candidate-scout'
    || jobType === 'compile-world-baseline'
    || jobType === 'correlate-market-signals'
    || jobType === 'monitor-market-theses'
    || jobType === 'refresh-market-hypothesis-research'
    || jobType === 'prune-market-data'
  ) return 'market-data'
  if (jobType === 'backup-market-corpus' || jobType === 'verify-market-corpus') return 'market-data'
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

  if (job.job_type === 'monitor-investment-theses') {
    return monitorInvestmentTheses()
  }

  if (job.job_type === 'ingest-world-source') {
    const adapterId = typeof job.payload.adapterId === 'string' ? job.payload.adapterId : ''
    if (adapterId) {
      const adapter = getWorldSourceAdapter(adapterId)
      if (!adapter) throw new Error(`Unknown world-source adapter: ${adapterId}`)
      await reportProgress(10, `fetching ${adapter.label}`)
      const sourceResult = await adapter.ingest()
      const observations = sourceResult.observations
      await reportProgress(55, 'archiving source documents and observations')
      const stored = []
      for (const observation of observations) stored.push(await ingestWorldObservation(observation))
      await reportProgress(100, 'ingested')
      if (isMarketWorldModelEnabled() && stored.some((item) => item.materiality >= 55)) {
        // A source can partially succeed and then later supply the decisive
        // document. Tie downstream work to the observation set, not merely the
        // calendar day, so that recovery is visible in the next baseline.
        const evidenceFingerprint = stored.map((item) => item.id).sort().join('-')
        await enqueueAgentJob('compile-world-baseline', { scopeType: 'domain', scopeKey: adapter.domain, evidenceFingerprint })
        await enqueueAgentJob('compile-world-baseline', { scopeType: 'global', scopeKey: 'global', evidenceFingerprint })
        await enqueueAgentJob('synthesize-market-hypotheses', { reason: `source:${adapterId}`, evidenceFingerprint })
      }
      return {
        adapterId,
        sourceCount: observations.length,
        observationIds: stored.map((item) => item.id),
        failedSources: sourceResult.failures,
      }
    }
    const payload = job.payload.observation
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('World-source ingestion requires an observation payload')
    return ingestWorldObservation(payload as Parameters<typeof ingestWorldObservation>[0])
  }

  if (job.job_type === 'scout-world-sources') {
    const domainId = typeof job.payload.domainId === 'string' ? job.payload.domainId : ''
    const reason = typeof job.payload.reason === 'string' ? job.payload.reason : ''
    const trigger = job.payload.trigger === 'bootstrap' || job.payload.trigger === 'frontier_gap' || job.payload.trigger === 'coverage_review'
      ? job.payload.trigger
      : 'manual'
    if (!domainId || !reason) throw new Error('World-source scout requires a domain and reason')
    await reportProgress(5, 'scouting bounded source candidates')
    const run = await runWorldSourceScout({ domainId, reason, trigger })
    await reportProgress(100, 'candidate sources preserved for contract review')
    return { discoveryRunId: run.id, domainId: run.domainId, candidateCount: run.candidates.length, status: run.status }
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
    const due = await findDueMarketHypothesisResearch(typeof job.payload.ownerId === 'string' ? job.payload.ownerId : undefined)
    const queued = await Promise.all(due.map((item) => enqueueAgentJob('deepen-market-hypothesis', item)))
    return { ...result, queuedResearch: queued.length }
  }

  if (job.job_type === 'deepen-market-hypothesis') {
    const ownerId = typeof job.payload.ownerId === 'string' ? job.payload.ownerId : ''
    const hypothesisId = typeof job.payload.hypothesisId === 'string' ? job.payload.hypothesisId : ''
    if (!ownerId || !hypothesisId) throw new Error('Market research requires ownerId and hypothesisId')
    const { deepenMarketHypothesis } = await import('./market-thesis-research.ts')
    await reportProgress(5, 'loading bounded source ledger')
    const research = await deepenMarketHypothesis({ ownerId, hypothesisId, reason: typeof job.payload.reason === 'string' ? job.payload.reason : 'scheduled deepening' })
    await reportProgress(100, research.status === 'complete' ? 'validated research published' : 'research requires revision')
    const marketThesis = research.status === 'complete' ? await import('./world-memory.ts').then(({ promoteEligibleMarketHypothesis }) => promoteEligibleMarketHypothesis(ownerId, hypothesisId)) : null
    return { hypothesisId, researchVersionId: research.id, version: research.version, status: research.status, marketThesisId: marketThesis?.id ?? null }
  }

  if (job.job_type === 'refresh-market-hypothesis-research') {
    const { findDueMarketHypothesisResearch } = await import('./market-thesis-research.ts')
    const due = await findDueMarketHypothesisResearch()
    const queued = await Promise.all(due.map((item) => enqueueAgentJob('deepen-market-hypothesis', item)))
    return { queued: queued.length, hypothesisIds: due.map((item) => item.hypothesisId) }
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
  const model = provider === 'codex'
    ? (job.job_type === 'scout-world-sources' ? selectMarketModel('source_scout').model : (process.env.CODEX_SYNTHESIS_MODEL ?? AI_MODELS.scheduledSynthesis))
    : null
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
