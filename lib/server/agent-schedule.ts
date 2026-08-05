import {
  buildAgentJobDedupeKey,
  enqueueAgentJob,
  type AgentJobType,
} from './agent-jobs.ts'
import {
  fmpIntelligenceCadenceMinutes,
  isUsMarketRefreshWindow,
  isWeekdayAfterMarketClose,
  newYorkClockParts,
} from '../markets/market-clock.ts'
import { isMarketWorldModelEnabled } from './world-memory.ts'
import { fetchActiveMarketDomainPacks } from './world-source-control.ts'
import { listWorldSourceAdapters } from './world-sources.ts'

export interface ScheduledAgentJob {
  jobType: AgentJobType
  payload: Record<string, unknown>
  dedupeKey: string
}

export interface AgentScheduleOptions {
  includeFmp?: boolean
  includeCodex?: boolean
  includeRobinhood?: boolean
  /** Resolved by the worker from durable active-domain state before ingestion. */
  worldSourceAdapters?: WorldSourceAdapterSchedule[]
}

interface WorldSourceAdapterSchedule {
  id: string
  cadence: 'daily' | 'weekly'
}

function robinhoodSyncSlot(now: Date): 'open' | 'midday' | 'close' | 'final' | null {
  const { weekday, hour, minute } = newYorkClockParts(now)
  if (weekday === 'Sat' || weekday === 'Sun') return null
  const minutes = hour * 60 + minute
  if (minutes < 9 * 60 + 20) return null
  if (minutes < 12 * 60 + 15) return 'open'
  if (minutes < 16 * 60 + 15) return 'midday'
  if (minutes < 20 * 60) return 'close'
  return 'final'
}

function scheduledJob(
  jobType: AgentJobType,
  now: Date,
  payload: Record<string, unknown> = {},
): ScheduledAgentJob {
  return {
    jobType,
    payload,
    dedupeKey: buildAgentJobDedupeKey(jobType, now, payload),
  }
}

export function buildDueAgentJobs(
  now = new Date(),
  options: AgentScheduleOptions = {},
): ScheduledAgentJob[] {
  const jobs = [scheduledJob('sync-market-assets', now)]
  if (options.includeRobinhood === true) {
    const slot = robinhoodSyncSlot(now)
    if (slot) jobs.push(scheduledJob('sync-robinhood-portfolio', now, {
      slot,
      tradingDate: newYorkClockParts(now).date,
    }))
  }
  const intelligenceCadence = fmpIntelligenceCadenceMinutes(now)
  const monitorCadence = isUsMarketRefreshWindow(now) ? 5 : intelligenceCadence
  if (isUsMarketRefreshWindow(now)) {
    jobs.push(scheduledJob('refresh-market-screener', now, { mode: 'market-hours' }))
  } else if (isWeekdayAfterMarketClose(now)) {
    jobs.push(scheduledJob('refresh-market-screener', now, { mode: 'daily' }))
  }
  jobs.push(scheduledJob('prune-market-data', now))
  if (options.includeFmp !== false) {
    jobs.push(scheduledJob('refresh-fmp-intelligence', now, { cadenceMinutes: intelligenceCadence }))
    if (isUsMarketRefreshWindow(now)) {
      jobs.push(scheduledJob('refresh-cross-asset', now, { mode: 'market-hours' }))
    } else if (now.getUTCHours() >= 21) {
      jobs.push(scheduledJob('refresh-cross-asset', now, { mode: 'daily' }))
    }
    if (isWeekdayAfterMarketClose(now)) {
      jobs.push(scheduledJob('materialize-market-leadership', now, {
        tradingDate: now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }),
      }))
    }
  }
  jobs.push(scheduledJob('monitor-investment-theses', now, { cadenceMinutes: monitorCadence }))
  const newYork = newYorkClockParts(now)
  // Injected adapters are used by deterministic schedule tests; production
  // reaches this branch only when the guarded world model is enabled.
  if (isMarketWorldModelEnabled() || options.worldSourceAdapters !== undefined) {
    if (newYork.hour === 16 && newYork.minute < 10) {
      jobs.push(scheduledJob('verify-world-source-health', now))
    }
    if (newYork.hour === 17 && newYork.minute < 10) {
      // The fallback keeps direct schedule tests deterministic. The worker
      // supplies the durable active-domain selection in normal operation.
      const adapters = options.worldSourceAdapters ?? [{ id: 'ai-power-v1', cadence: 'daily' }]
      for (const adapter of adapters) {
        if (adapter.cadence === 'daily' || (adapter.cadence === 'weekly' && newYork.weekday === 'Sun')) {
          jobs.push(scheduledJob('ingest-world-source', now, { adapterId: adapter.id }))
        }
      }
    }
    if (newYork.hour === 17 && newYork.minute >= 20 && newYork.minute < 30) {
      jobs.push(scheduledJob('collect-world-source-documents', now))
    }
    if (newYork.hour === 18 && newYork.minute < 10) {
      jobs.push(scheduledJob('compile-world-baseline', now, { scopeType: 'global', scopeKey: 'global' }))
    }
    if (newYork.hour === 20 && newYork.minute < 10) {
      jobs.push(scheduledJob('synthesize-market-hypotheses', now))
    }
    if (newYork.hour % 6 === 0 && newYork.minute < 10) {
      // The orchestrator is the sole 6h research control plane. It auto-accepts
      // eligible proposals, then enqueues bounded child jobs (scout, collect,
      // critic, prediction eval) under explicit cost caps.
      jobs.push(scheduledJob('orchestrate-market-research', now))
    }
    if (newYork.weekday === 'Sun' && newYork.hour === 18 && newYork.minute < 10) {
      jobs.push(scheduledJob('correlate-market-signals', now, { mode: 'weekly' }))
    }
    if (newYork.weekday === 'Sun' && newYork.hour === 19 && newYork.minute < 10) {
      jobs.push(scheduledJob('review-world-source-coverage', now))
    }
  }
  if (newYork.hour === 2 && newYork.minute >= 30 && newYork.minute < 40) {
    jobs.push(scheduledJob('backup-market-corpus', now))
  }
  if (newYork.weekday === 'Sun' && newYork.hour === 3 && newYork.minute >= 30 && newYork.minute < 40) {
    jobs.push(scheduledJob('verify-market-corpus', now))
  }
  const utcHour = now.getUTCHours()

  if (options.includeCodex !== false) {
    if (utcHour >= 12) jobs.push(scheduledJob('generate-morning-brief', now))
    if (now.getUTCDay() === 1 && utcHour >= 13) jobs.push(scheduledJob('generate-weekly-overview', now))
    if ([1, 15].includes(now.getUTCDate()) && utcHour >= 14) {
      jobs.push(scheduledJob('generate-monthly-overview', now))
    }
  }

  return jobs
}

export async function enqueueDueAgentJobs(
  now = new Date(),
  lastScheduledKeys = new Map<AgentJobType, string>(),
  options: AgentScheduleOptions = {},
): Promise<Array<ScheduledAgentJob & { id: string; deduplicated: boolean }>> {
  const enqueued = []
  const newYork = newYorkClockParts(now)
  let worldSourceAdapters = options.worldSourceAdapters
  if (worldSourceAdapters === undefined && isMarketWorldModelEnabled() && newYork.hour === 17 && newYork.minute < 10) {
    try {
      const activeDomains = new Set((await fetchActiveMarketDomainPacks()).map((pack) => pack.id))
      worldSourceAdapters = listWorldSourceAdapters()
        .filter((adapter) => activeDomains.has(adapter.domain))
        .map((adapter) => ({ id: adapter.id, cadence: adapter.cadence }))
    } catch (error) {
      // Fail closed for source ingestion while allowing other market jobs to
      // proceed. A static adapter list is never an approval decision.
      console.warn(`Unable to resolve active world-source adapters: ${error instanceof Error ? error.message : String(error)}`)
      worldSourceAdapters = []
    }
  }

  for (const job of buildDueAgentJobs(now, { ...options, ...(worldSourceAdapters === undefined ? {} : { worldSourceAdapters }) })) {
    if (lastScheduledKeys.get(job.jobType) === job.dedupeKey) continue
    const result = await enqueueAgentJob(job.jobType, job.payload, job.dedupeKey)
    lastScheduledKeys.set(job.jobType, job.dedupeKey)
    enqueued.push({ ...job, ...result })
  }

  return enqueued
}
