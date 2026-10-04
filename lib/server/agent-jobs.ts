import {
  agentJobProvider,
  agentJobStaleAfterMs,
  buildAgentJobDedupeKey,
  marketModelRoutingForAgentJob,
  modelForAgentJob,
  normalizeClaimedAgentJob,
  parseAgentJobPayload,
  parseAgentJobType,
  shouldCoalesceAgentJob,
  shouldRefreshClosedMarket,
  type AgentJobHandler,
  type AgentJobHandlers,
  type AgentJobProgress,
  type AgentJobRecord,
  type AgentJobType,
} from './agent-job-contracts.ts'
import { enqueueAgentJob } from './agent-job-queue.ts'

// Keep existing worker imports compatible while queue producers use the smaller modules.
export * from './agent-job-contracts.ts'
export { enqueueAgentJob, isMissingDedupeConstraint } from './agent-job-queue.ts'

import { seedDecisionResearch } from './interest-coverage.ts'
import { reviewCompanyWorldReceipt } from './company-world-memory.ts'
import { lastCompletedSession } from '../markets/market-sessions.ts'
import { generateAIOverview } from '../data/overview.ts'
import { generateGlobalNewsOverview } from '../data/global-news-overview.ts'
import { saveDailyOverview, saveGlobalNewsDailyOverview } from '../data/overview-persistence.ts'
import { captureShadowPolicies, evaluateShadowPolicies } from './investment-shadow.ts'
import { dependencyReadiness, parseRecommendationDependencies } from '../markets/recommendation-preparation.ts'
import { prepareDailyRecommendations } from './recommendation-preparation.ts'
import { AgentJobPool } from './agent-job-pool.ts'
import { runIsolatedAgentAttempt } from './isolated-agent-attempt.ts'
import { agentAttemptEnvironment } from './agent-attempt-environment.ts'
import { blockingFingerprint, blockingReason } from './agent-blocking.ts'
import { MARKETS_OWNER_ID } from '../auth/markets-auth.ts'
import { captureInvestmentMacro } from './investment-macro.ts'
import { generateDailyRecommendations } from './recommendations.ts'
import { evaluateRecommendationOutcomes, reviewRecommendationCohort } from './recommendation-outcomes.ts'
import { sendInvestmentNewsletter } from './investment-newsletter.ts'
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
  isMarketWorldModelEnabled,
} from './world-memory.ts'
import { backupMarketCorpus, verifyMarketCorpusBackup } from './world-backup.ts'
import { getWorldSourceAdapter, listWorldSourceAdapters } from './world-sources.ts'
import { fetchActiveMarketDomainPacks, findCandidateSourcePreflights, findWorldSourceCoverageScoutPlans, isMarketDomainActive, runWorldSourceScout } from './world-source-control.ts'
import { runMarketResearchScout } from './market-research-scout.ts'
import { auditWorldSourceHealth, preflightWorldSourceCandidate } from './world-source-health.ts'
import { collectGovernedWorldSourceDocuments } from './world-source-collector.ts'
import { triageCapturedWorldObservationProposals } from './world-observation-proposals.ts'
import { evaluateMarketPrediction, findDueMarketPredictionEvaluations } from './market-prediction-evaluation.ts'
import {
  fetchPersistedMarketAssets,
  materializeAlpacaScreener,
  syncAlpacaAssets,
} from './markets-ingestion.ts'
import { fetchLatestSnapshotMeta } from './markets-repository.ts'
import { getSupabaseClient } from './supabase.ts'
import { materializeIntelligenceSourceReferrals } from './intelligence-source-referrals.ts'
import { fetchPortfolioResearchSeedOwners } from './portfolio-research-seeding.ts'
import { refreshWorldEvents } from './world-events.ts'
import { runWorldThinker } from './world-thinker.ts'
import { reconcileWorldRepositoryProjection } from './world-projection.ts'
import { findExtraordinaryBiotechMovers } from './biotech-catalysts.ts'

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
  await reportProgress(70, 'refreshing normalized events for the Git World authority')
  const events = await refreshWorldEvents()
  await reportProgress(90, 'queuing unresolved legacy predictions for their original resolver')
  const predictions = await enqueueAgentJob('evaluate-market-predictions', {})
  await reportProgress(100, 'source evidence refreshed; legacy belief writers are retired')
  return { cycle, sourceAdapters: adapters.map(a => a.id), ingestions, health, collection, events, predictions,
    authority: 'git-world-v1', readiness: collection.readiness, errors: collection.errors }

}

export async function executeAgentJob(job: AgentJobRecord, reportProgress: (progress: number, phase: string) => Promise<void> = async () => {}): Promise<unknown> {
  const before = getFmpUsageSnapshot()
  return outputWithUsage(await executeJob(job, reportProgress), before, getFmpUsageSnapshot())
}

export async function resumeBlockedAgentJobs(): Promise<number> {
  const db = getSupabaseClient()
  if (!db) return 0
  const rows = await db.from('agent_jobs').select('id,blocked_on').eq('status', 'blocked').limit(100)
  if (rows.error) throw new Error(rows.error.message)
  let resumed = 0
  for (const row of rows.data ?? []) {
    const state = row.blocked_on as { reason: string; fingerprint: string }
    if (!state?.reason || state.fingerprint === await blockingFingerprint(state.reason)) continue
    const changed = await db.from('agent_jobs').update({ status: 'queued', blocked_on: null, attempts: 0, run_after: new Date().toISOString() }).eq('id', row.id).eq('status', 'blocked')
    if (changed.error) throw new Error(changed.error.message)
    resumed++
  }
  return resumed
}

const generateCompanyResearchJob: AgentJobHandler<'generate-company-research' | 'event-refresh-company-research'> = async (job, reportProgress) => {
    const ownerId = typeof job.payload.ownerId === 'string' ? job.payload.ownerId : ''
    const symbol = typeof job.payload.symbol === 'string' ? job.payload.symbol.toUpperCase() : ''
    if (!ownerId || !symbol) throw new Error('Research jobs require ownerId and symbol')
    const note = await generateFullEquityResearch(
      symbol,
      ownerId,
      String(job.payload.reason ?? 'manual'),
      reportProgress,
      {
        forceFullResearch: job.payload.forceFullResearch === true,
        investigationKey: job.id,
        worldOpportunityLeadId: typeof job.payload.worldOpportunityLeadId === 'string' ? job.payload.worldOpportunityLeadId : undefined,
        marketThesisVersionId: typeof job.payload.marketThesisVersionId === 'string'
          ? job.payload.marketThesisVersionId
          : undefined,
      },
    )
    const worldOpportunityLeadId = typeof job.payload.worldOpportunityLeadId === 'string' ? job.payload.worldOpportunityLeadId : null
    if (worldOpportunityLeadId) {
      const supabase = getSupabaseClient()
      if (supabase) await supabase.from('world_opportunity_leads').update({ status: 'researched', research_note_id: note.id, updated_at: new Date().toISOString() }).eq('id', worldOpportunityLeadId)

    }
    return { researchNoteId: note.id, symbol, version: note.version, dataAsOf: note.dataAsOf, worldOpportunityLeadId, coverage: note.coverageDiagnostics ?? null }
}

const retiredBeliefJob: AgentJobHandler = async () => ({
  readiness: 'blocked',
  errors: ['Unsupported capability: legacy belief writer retired; use Git World investigation'],
  authority: 'git-world-v1',
})

/** Every registered job has an explicit handler, including retired compatibility IDs. */
const AGENT_JOB_HANDLERS: AgentJobHandlers = {
  'review-recommendation-trade': async (job, reportProgress) => {
    await reportProgress(15,'Reading your completed-trade report')
    const {extractReportedTrade}=await import('./trade-extraction.ts')
    const result=await extractReportedTrade(String(job.payload.instruction??''))
    await reportProgress(100,'Trade details extracted for owner confirmation')
    return result
  },
  'generate-daily-recommendations': async (job) => {
    await captureInvestmentMacro().catch(error => console.warn(JSON.stringify({ event: 'investment_macro_capture_failed', error: error instanceof Error ? error.message : String(error) })))
    const now = new Date(), ownerId = typeof job.payload.ownerId === 'string' ? job.payload.ownerId : undefined, editionKey = typeof job.payload.editionKey === 'string' ? job.payload.editionKey : 'daily'
    const result = job.payload.phase === 'publish'
      ? await generateDailyRecommendations(ownerId, now, editionKey)
      : await prepareDailyRecommendations(ownerId ?? MARKETS_OWNER_ID,editionKey,enqueueAgentJob,now)
    if ('preparing' in result) return result
    await captureShadowPolicies(result.batchId)
    return result
  },
  'evaluate-recommendation-outcomes': async () => {
    const outcomes = await evaluateRecommendationOutcomes()
    const shadow = await evaluateShadowPolicies(MARKETS_OWNER_ID)
    return {outcomes, shadow}
  },
  'review-recommendation-cohort': async () => {
    return reviewRecommendationCohort()
  },
  'send-investment-newsletter': async () => {
    return sendInvestmentNewsletter()
  },
  'sync-market-assets': async () => {
    const client = getAlpacaClient()
    if (!client) throw new Error('Alpaca credentials are not configured')
    const assets = await syncAlpacaAssets(client)
    const expanded = await refreshExpandedMarketUniverse(assets, client, { forceRefresh: true })
    return {
      count: assets.length,
      eligibleListingCount: expanded.eligibleListingCount,
      screenerUniverseCount: expanded.selectedCount,
    }
  },
  'sync-robinhood-portfolio': async (job) => {
    const slot = job.payload.slot
    if (slot !== 'open' && slot !== 'midday' && slot !== 'close' && slot !== 'final') {
      throw new Error('Robinhood sync requires a valid capture slot')
    }
    return syncRobinhoodPortfolio(undefined, slot as RobinhoodSyncSlot)
  },
  'refresh-market-screener': async (job) => {
    const client = getAlpacaClient()
    if (!client) throw new Error('Alpaca credentials are not configured')
    const clock = await client.fetchClock()
    const coverageSymbol = job.payload.mode === 'coverage' && typeof job.payload.symbol === 'string'
      ? job.payload.symbol.trim().toUpperCase()
      : null
    if (!clock.isOpen && !coverageSymbol) {
      const latest = await fetchLatestSnapshotMeta()
      const now = new Date()
      const calendar = await client.fetchCalendar(new Date(now.getTime() - 14 * 86_400_000).toISOString().slice(0, 10), now.toISOString().slice(0, 10))
      const completed = lastCompletedSession(calendar, now)
      // A recently published intraday snapshot must not suppress final-session ingestion.
      const finalSessionCaptured = latest && completed && latest.history_through === completed.date
      if (!shouldRefreshClosedMarket(latest) && finalSessionCaptured) {
        return { skipped: 'market_closed_recent_snapshot', nextOpen: clock.nextOpen }
      }
    }

    let assets = await fetchPersistedMarketAssets()
    if (assets.length === 0) assets = await syncAlpacaAssets(client)
    assets = await resolveMarketUniverse(assets)
    const snapshot = await materializeAlpacaScreener({ client, assets })
    const biotechMovers = await findExtraordinaryBiotechMovers(snapshot.snapshotId)
    if (biotechMovers.length > 0) {
      const tradingDate = new Date(snapshot.dataAsOf).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
      await enqueueAgentJob(
        'run-candidate-scout',
        { tradingDate, reason: 'extraordinary-biotech-move', symbols: biotechMovers, marketSnapshotId: snapshot.snapshotId },
        `run-candidate-scout:biotech:${tradingDate}:${biotechMovers.slice().sort().join(',')}`,
      )
    }
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
  },
  'prune-market-data': async () => {
    return pruneMarketData()
  },
  'refresh-cross-asset': async () => {
    const snapshot = await materializeCrossAssetSnapshot()
    return {
      snapshotId: snapshot.id,
      observationCount: snapshot.observations.length,
      dataAsOf: snapshot.dataAsOf,
    }
  },
  'materialize-market-leadership': async () => {
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
  },
  'run-candidate-scout': async (job) => {
    const briefs = await materializeCandidateScout({
      tradingDate: typeof job.payload.tradingDate === 'string' ? job.payload.tradingDate : undefined,
      preferredSymbols: Array.isArray(job.payload.symbols) ? job.payload.symbols.filter((symbol): symbol is string => typeof symbol === 'string') : undefined,
    })
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
  },
  'summarize-candidate-scout': async (job) => {
    const weekEnding = typeof job.payload.weekEnding === 'string' ? job.payload.weekEnding : ''
    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekEnding)) throw new Error('Candidate weekly summary requires a week-ending date')
    return materializeCandidateWeeklySummary({ weekEnding })
  },
  'refresh-company-packet': async (job) => {
    const symbol = typeof job.payload.symbol === 'string' ? job.payload.symbol.trim().toUpperCase() : ''
    const ownerId = typeof job.payload.ownerId === 'string' ? job.payload.ownerId : ''
    if (!/^[A-Z][A-Z0-9.-]{0,11}$/.test(symbol) || !ownerId) {
      throw new Error('Company packet refresh requires an owner and valid stock symbol')
    }
    const packet = await materializeCompanyPacket(symbol, ownerId)
    return { symbol, packetId: packet.id, dataAsOf: packet.dataAsOf }
  },
  'generate-company-research': generateCompanyResearchJob,
  'generate-etf-research': async (job, reportProgress) => {
    const ownerId = typeof job.payload.ownerId === 'string' ? job.payload.ownerId : ''
    const symbol = typeof job.payload.symbol === 'string' ? job.payload.symbol.toUpperCase() : ''
    if (!ownerId || !symbol) throw new Error('ETF research jobs require ownerId and symbol')
    const note = await generateEtfResearch(
      symbol,
      ownerId,
      String(job.payload.reason ?? 'manual'),
      reportProgress,
      job.payload.forceFullResearch === true,
      job.id,
    )
    return { researchNoteId: note.id, symbol, version: note.version, dataAsOf: note.dataAsOf, instrumentType: 'etf' }
  },
  'event-refresh-company-research': generateCompanyResearchJob,
  'scan-research-refreshes': async () => {
    return scanResearchRefreshes()
  },
  'seed-portfolio-company-research': async (job) => {
    const requestedOwnerId = typeof job.payload.ownerId === 'string' ? job.payload.ownerId : null
    const ownerIds = requestedOwnerId ? [requestedOwnerId] : await fetchPortfolioResearchSeedOwners()
    const results = []
    for (const ownerId of ownerIds) results.push({ownerId,...await seedDecisionResearch(ownerId,enqueueAgentJob,new Date(),{backfillAll:true})})
    return {owners:results,note:'Eight daily investigations; dated holdings upgrades and rotating interest coverage.'}
  },
  'monitor-investment-theses': async () => {
    return monitorInvestmentTheses()
  },
  'refresh-fmp-intelligence': async () => {
    return syncFmpMarketIntelligence()
  },
  'fetch-stock-price-history': async (job, reportProgress) => {
    const symbol = typeof job.payload.symbol === 'string' ? job.payload.symbol.trim().toUpperCase() : ''
    if (!/^[A-Z][A-Z0-9.-]{0,11}$/.test(symbol)) throw new Error('Stock price history requires a valid symbol')
    await reportProgress(20, 'fetching FMP daily prices')
    const history = await cacheFmpFiveYearPriceHistory(symbol)
    await reportProgress(100, 'cached')
    return { symbol, provider: history.provider, dataAsOf: history.dataAsOf, pointCount: history.history.length }
  },
  'generate-market-memo': async (job) => {
    const snapshotId = typeof job.payload.snapshotId === 'string'
      ? job.payload.snapshotId
      : (await fetchLatestSnapshotMeta())?.id
    if (!snapshotId) throw new Error('No completed market snapshot is available')
    return materializeMarketMemo(snapshotId, { synthesize: job.payload.synthesize !== false })
  },
  'generate-daily-overview': async (job) => {
    const global = job.payload.scope === 'global-news'
    const data = await (global ? generateGlobalNewsOverview : generateAIOverview)({ provider: 'codex' })
    await (global ? saveGlobalNewsDailyOverview : saveDailyOverview)(data)
    if (['blocked', 'failed'].includes(data.readiness ?? '')) throw new Error(data.errors?.join('; ') ?? 'Intelligence generation unavailable')
    return data
  },
  'generate-morning-brief': async () => {
    const brief = await generateMorningBrief({ provider: 'codex' })
    await saveMorningBrief(brief)
    if (['blocked', 'failed'].includes(brief.readiness ?? '')) throw new Error(brief.errors?.join('; ') ?? 'Morning brief unavailable')
    return { sectionCount: brief.sections.length, generatedAt: brief.generatedAt }
  },
  'generate-weekly-overview': async () => {
    const result = await generateWeeklyOverview({ provider: 'codex' })
    if (!result.success) throw new Error(result.error ?? 'Weekly overview generation failed')
    return result
  },
  'generate-monthly-overview': async () => {
    const result = await generateMonthlyOverview({ provider: 'codex' })
    if (!result.success) throw new Error(result.error ?? 'Monthly overview generation failed')
    return result
  },
  'ingest-world-source': async (job, reportProgress) => {
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
        await enqueueAgentJob('refresh-world-events', { reason: `source:${adapterId}`, evidenceFingerprint })
      }
      return sourceResult
    }
    const payload = job.payload.observation
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('World-source ingestion requires an observation payload')
    return ingestWorldObservation(payload as Parameters<typeof ingestWorldObservation>[0])
  },
  'run-market-thesis-cycle': async (job, reportProgress) => {
    if (!validMarketThesisCycle(job.payload.cycle)) throw new Error('Market thesis cycle requires a valid cycle')
    return runMarketThesisCycle(job.payload.cycle, reportProgress)
  },
  'verify-world-source-health': async (job, reportProgress) => {
    await reportProgress(5, 'probing approved source contracts')
    const audit = await auditWorldSourceHealth()
    await reportProgress(100, `${audit.healthy} healthy, ${audit.degraded} degraded, ${audit.failed} failed`)
    return { checked: audit.checks.length, healthy: audit.healthy, degraded: audit.degraded, failed: audit.failed }
  },
  'preflight-world-source-candidate': async (job, reportProgress) => {
    const slug = typeof job.payload.slug === 'string' ? job.payload.slug.trim().toLowerCase() : ''
    if (!slug) throw new Error('Candidate preflight requires a source slug')
    await reportProgress(5, 'probing the candidate direct target')
    const check = await preflightWorldSourceCandidate(slug)
    await reportProgress(100, `${check.status} candidate target check recorded`)
    return { sourceId: check.sourceId, slug, status: check.status, resolvedUrl: check.resolvedUrl, mimeType: check.mimeType }
  },
  'collect-world-source-documents': async (job, reportProgress) => {
    await reportProgress(5, 'collecting bounded governed source documents')
    const result = await collectGovernedWorldSourceDocuments()
    if (result.captureIds.length > 0) await enqueueAgentJob('triage-world-observation-proposals', { captureIds: result.captureIds })
    await reportProgress(100, `${result.captured} captured, ${result.rejected} rejected, ${result.failed} failed`)
    return result
  },
  'triage-world-observation-proposals': async (job, reportProgress) => {
    const captureIds = Array.isArray(job.payload.captureIds) ? job.payload.captureIds.filter((item): item is string => typeof item === 'string') : undefined
    await reportProgress(5, 'creating quote-verified observation proposals')
    const result = await triageCapturedWorldObservationProposals({ captureIds })
    await reportProgress(100, `${result.proposals} reviewable proposals from ${result.documents} documents; ${result.failures.length} isolated failures`)
    return result
  },
  'auto-accept-observation-proposals': async (job, reportProgress) => {
    const { autoAcceptEligibleWorldObservationProposals } = await import('./world-observation-review.ts')
    await reportProgress(5, 're-checking quote-bound proposals against worker corpus extracts')
    const result = await autoAcceptEligibleWorldObservationProposals({
      domainId: typeof job.payload.domainId === 'string' ? job.payload.domainId : undefined,
      limit: typeof job.payload.limit === 'number' ? job.payload.limit : 40,
    })
    if (result.accepted > 0) {
      await enqueueAgentJob('refresh-world-events', {
        reason: `policy auto-accept:${result.accepted}`,
        evidenceFingerprint: result.observationIds[0] ?? 'auto-accept',
      })
    }
    await reportProgress(100, `${result.accepted} accepted; ${result.failed} failed checks; ${Object.values(result.remainingByDomain).reduce((sum, count) => sum + count, 0)} still awaiting human review`)
    return result
  },
  'scout-market-research': async (job, reportProgress) => {
    const domainId = typeof job.payload.domainId === 'string' ? job.payload.domainId : ''
    const reason = typeof job.payload.reason === 'string' ? job.payload.reason : ''
    const frontierIds = Array.isArray(job.payload.frontierIds)
      ? job.payload.frontierIds.filter((item): item is string => typeof item === 'string') : []
    if (!domainId || !reason) throw new Error('Broad research scout requires a domain and reason')
    await reportProgress(5, 'investigating broad, citation-required research leads')
    const run = await runMarketResearchScout({ domainId, reason, frontierIds, trigger: job.payload.trigger === 'frontier_gap' ? 'frontier_gap' : 'manual' })
    await reportProgress(100, `${run.leads.length} provisional leads; no source contract or market evidence was auto-created`)
    return { researchScoutRunId: run.id, domainId, leadCount: run.leads.length, unresolvedQuestions: run.unresolvedQuestions.length }
  },
  'scout-world-sources': async (job, reportProgress) => {
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
  },
  'review-world-source-coverage': async () => {
    const plans = await findWorldSourceCoverageScoutPlans()
    const queued = await Promise.all(plans.map((plan) => enqueueAgentJob('scout-world-sources', {
      domainId: plan.domainId, reason: plan.reason, trigger: 'coverage_review',
    })))
    return { planned: plans.length, queued: queued.filter((item) => !item.deduplicated).length, domainIds: plans.map((plan) => plan.domainId) }
  },
  'scan-intelligence-source-referrals': async (job, reportProgress) => {
    await reportProgress(5, 'scanning existing Intelligence and Markets feed records for bounded source referrals')
    const result = await materializeIntelligenceSourceReferrals()
    await reportProgress(100, `${result.created} pending referrals from ${result.scanned} recent feed records; none were admitted as evidence`)
    return result
  },
  'compile-world-baseline': async (job) => {
    const scopeType = job.payload.scopeType === 'domain' ? 'domain' : 'global'
    const scopeKey = typeof job.payload.scopeKey === 'string' ? job.payload.scopeKey : 'global'
    return compileWorldBaseline(scopeType, scopeKey)
  },
  'correlate-market-signals': retiredBeliefJob,
  'synthesize-market-hypotheses': retiredBeliefJob,
  'deepen-market-hypothesis': retiredBeliefJob,
  'refresh-market-hypothesis-research': retiredBeliefJob,
  'route-market-research-frontiers': retiredBeliefJob,
  'orchestrate-market-research': retiredBeliefJob,
  'evaluate-market-prediction': async (job, reportProgress) => {
    const predictionId = typeof job.payload.predictionId === 'string' ? job.payload.predictionId : ''
    if (!predictionId) throw new Error('Prediction evaluation requires a prediction ID')
    await reportProgress(5, 'loading post-prediction evidence')
    const result = await evaluateMarketPrediction({ predictionId })
    if (result.evaluation.verdict === 'disconfirmed') {
      await enqueueAgentJob('run-world-thinker', {
        trigger: 'scheduled', legacyPredictionId: predictionId,
        reason: `prediction disconfirmed: ${predictionId}`,
      })
    }
    await reportProgress(100, `prediction evaluation ${result.evaluation.verdict}`)
    return { predictionId, evaluationId: result.evaluation.id, verdict: result.evaluation.verdict, hypothesisId: result.hypothesisId }
  },
  'evaluate-market-predictions': async () => {
    const predictionIds = await findDueMarketPredictionEvaluations()
    const queued = await Promise.all(predictionIds.map((predictionId) => enqueueAgentJob('evaluate-market-prediction', { predictionId })))
    return { queued: queued.length, predictionIds }
  },
  'monitor-market-theses': retiredBeliefJob,
  'backup-market-corpus': async () => {
    return backupMarketCorpus()
  },
  'verify-market-corpus': async () => {
    return verifyMarketCorpusBackup()
  },
  'refresh-world-events': async (job) => {
    const result = await refreshWorldEvents()
    if (job.payload.runThinkerAfter === true) {
      await enqueueAgentJob('run-world-thinker', { trigger: 'manual', eventClusterIds: result.urgent.length ? result.urgent : undefined })
    } else if (result.urgent.length > 0) {
      await enqueueAgentJob('run-world-thinker', { trigger: 'urgent', eventClusterIds: result.urgent })
    }
    return result
  },
  'refresh-world-benchmark': async () => {
    const { evaluateWorldBenchmark, seedWorldBenchmarkFromEventLedger } = await import('./world-benchmark.ts')
    const seeded = await seedWorldBenchmarkFromEventLedger()
    const evaluation = await evaluateWorldBenchmark()
    return { seeded, evaluation }
  },
  'run-world-replay': async (job) => {
    const { processWorldReplayStep, startWorldReplay } = await import('./world-replay.ts')
    const replay = typeof job.payload.replayRunId === 'string'
      ? { id: job.payload.replayRunId }
      : await startWorldReplay({
        since: typeof job.payload.since === 'string' ? new Date(job.payload.since) : undefined,
        until: typeof job.payload.until === 'string' ? new Date(job.payload.until) : undefined,
      })
    const result = await processWorldReplayStep(replay.id, { model: job.payload.model !== false, cursorAt: typeof job.payload.cursorAt === 'string' ? job.payload.cursorAt : undefined })
    if (!result.complete && !result.superseded) {
      const resumeAttempt = Number(job.payload.resumeAttempt ?? 0) + 1
      const payload = { replayRunId: replay.id, cursorAt: result.replay.cursorAt, step: result.nextStep, resumeAttempt, model: job.payload.model !== false }
      await enqueueAgentJob(
        'run-world-replay', payload, buildAgentJobDedupeKey('run-world-replay', new Date(), payload),
        result.deferred ? { runAfter: new Date(Date.now() + 2 * 60_000) } : {},
      )
    }
    return result
  },
  'run-world-thinker': async (job) => {
    const trigger = job.payload.trigger
    if (trigger !== 'scheduled' && trigger !== 'urgent' && trigger !== 'manual' && trigger !== 'backfill' && trigger !== 'company_research') throw new Error('World Thinker trigger is invalid')
    const eventClusterIds = Array.isArray(job.payload.eventClusterIds) ? job.payload.eventClusterIds.filter((value): value is string => typeof value === 'string') : undefined
    const coverageFrontierIds = Array.isArray(job.payload.coverageFrontierIds)
      ? job.payload.coverageFrontierIds.filter((value): value is string => typeof value === 'string')
      : typeof job.payload.coverageFrontierId === 'string' ? [job.payload.coverageFrontierId] : undefined
    if(trigger==='company_research') {
      if(typeof job.payload.researchNoteId!=='string')throw new Error('Company feedback requires a completed report receipt')
      const canonical = process.env.STRATUM_WORLD_CUTOVER_ENABLED === 'true'
      return reviewCompanyWorldReceipt(job.payload.researchNoteId,job.id,
        options=>runWorldThinker({...options,canonicalProjection:canonical}),
        commit=>reconcileWorldRepositoryProjection({commit,canonical}))
    }
    return runWorldThinker({
      legacyHypothesisId: typeof job.payload.legacyHypothesisId === 'string' ? job.payload.legacyHypothesisId : undefined,
      ownerReviewItemId: typeof job.payload.ownerReviewItemId === 'string' ? job.payload.ownerReviewItemId : undefined,
      trigger, eventClusterIds, coverageFrontierIds, agentJobId: job.id, canonicalProjection: process.env.STRATUM_WORLD_CUTOVER_ENABLED === 'true',
        worldOpportunityLeadId: typeof job.payload.worldOpportunityLeadId === 'string' ? job.payload.worldOpportunityLeadId : undefined,
      researchNoteId: typeof job.payload.researchNoteId === 'string' ? job.payload.researchNoteId : undefined,
      symbol: typeof job.payload.symbol === 'string' ? job.payload.symbol : undefined,
    })
  },
  'project-world-repository': async (job) => {
    return reconcileWorldRepositoryProjection({ commit: typeof job.payload.commit === 'string' ? job.payload.commit : undefined, canonical: process.env.STRATUM_WORLD_CUTOVER_ENABLED === 'true' })
  },
}

export function resolveAgentJobHandler(jobType: unknown, handlers: Partial<AgentJobHandlers> = AGENT_JOB_HANDLERS): AgentJobHandler {
  const type = parseAgentJobType(jobType)
  const handler = handlers[type]
  if (!handler) throw new Error(`Missing agent job handler: ${type}`)
  // The key was validated above; dispatch preserves the matching job/payload pair.
  return handler as AgentJobHandler
}

async function executeJob(job: AgentJobRecord, reportProgress: AgentJobProgress = async () => {}): Promise<unknown> {
  const handler = resolveAgentJobHandler(job.job_type)
  if (handler === retiredBeliefJob) return handler(job, reportProgress)
  const payload = parseAgentJobPayload(job.job_type, job.payload)
  return handler({ ...job, payload } as AgentJobRecord, reportProgress)
}

export async function processOneAgentJob(workerId: string): Promise<boolean> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')

  const { data, error } = await supabase.rpc('claim_agent_job', { p_worker_id: workerId })
  if (error) throw new Error(`Unable to claim agent job: ${error.message}`)
  const job = normalizeClaimedAgentJob(data)
  if (!job) return false

  // Waiting for source work is not a failed model attempt and must not occupy
  // a worker slot or exhaust retries. Preserve the claim-owner condition.
  let preparationError: unknown
  try {
  if (job.job_type === 'generate-daily-recommendations') {
    const ids = parseRecommendationDependencies(job.payload)
    if (ids.length) {
      const dependencies = await supabase.from('agent_jobs').select('id,status').in('id',ids)
      if (dependencies.error) throw new Error(dependencies.error.message)
      if (!dependencyReadiness(ids,dependencies.data)) {
        const deferred = await supabase.from('agent_jobs').update({status:'queued',claimed_by:null,claimed_at:null,
          attempts:job.attempts-1,run_after:new Date(Date.now()+60_000).toISOString(),updated_at:new Date().toISOString()})
          .eq('id',job.id).eq('status','running').eq('claimed_by',workerId).eq('attempts',job.attempts).select('id')
        if (deferred.error || deferred.data.length !== 1) throw new Error('Unable to defer recommendation preparation')
        return false
      }
    }
  }

  } catch (error) { preparationError = error }

  const startedAt = Date.now()
  const provider = job.job_type === 'generate-market-memo' && job.payload.synthesize === false
    ? 'market-data'
    : agentJobProvider(job.job_type)
  const modelRouting = marketModelRoutingForAgentJob(job.job_type)
  let attemptEnvironment = process.env
  try { attemptEnvironment = agentAttemptEnvironment(job) } catch (error) { preparationError ??= error }
  const model = modelForAgentJob(job.job_type, attemptEnvironment)
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

  try {
    if (preparationError) throw preparationError
    const output = await runIsolatedAgentAttempt(job, agentJobStaleAfterMs(job.job_type) - 60_000, reportProgress)
    if (output && typeof output === 'object' && (output as { readiness?: string }).readiness === 'blocked') throw new Error((output as { errors?: string[] }).errors?.join('; ') ?? 'Source collection is blocked; no usable evidence was captured')
    const transition = await supabase.rpc('finish_agent_attempt', {
      p_job_id:job.id,p_run_id:run.id,p_worker_id:workerId,p_success:true,p_output:output,
      p_error:null,p_duration_ms:Date.now()-startedAt,p_run_after:null,
    })
    if(transition.error) throw new Error(`Unable to persist job transition: ${transition.error.message}`)
    if(['generate-company-research','generate-etf-research','event-refresh-company-research'].includes(job.job_type)){const released=await supabase.from('research_investigation_slots').delete().eq('job_id',job.id).is('started_at',null);if(released.error)throw new Error(`Unable to release unused investigation capacity: ${released.error.message}`)}
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const reason = blockingReason(message)
    const blocked = reason ? { readiness: 'blocked', reason, fingerprint: await blockingFingerprint(reason) } : null
    const transition = await supabase.rpc('finish_agent_attempt', {
      p_job_id:job.id,p_run_id:run.id,p_worker_id:workerId,p_success:false,p_output:blocked,
      p_error:message.includes('<!DOCTYPE')?'Database gateway unavailable':message.slice(0,2000),
      p_duration_ms:Date.now()-startedAt,
      p_run_after:new Date(Date.now()+Math.min(30,2**job.attempts)*60_000).toISOString(),
    })
    if(transition.error) throw new Error(`Unable to persist job transition: ${transition.error.message}`)
  }

  return true
}

const workerPools = new Map<string, AgentJobPool>()
/** Yield after the first completed slot. Pending jobs remain in the same
 * bounded pool; the next worker tick refills only the released capacity. */
export async function processAgentJobs(workerId: string, concurrency = 1): Promise<number> {
  let pool = workerPools.get(workerId)
  if (!pool) {
    pool = new AgentJobPool(() => processOneAgentJob(workerId))
    workerPools.set(workerId, pool)
  }
  return pool.next(concurrency)
}
