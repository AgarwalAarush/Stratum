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

export interface ScheduledAgentJob {
  jobType: AgentJobType
  payload: Record<string, unknown>
  dedupeKey: string
}

export interface AgentScheduleOptions {
  includeFmp?: boolean
  includeCodex?: boolean
  includeRobinhood?: boolean
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
  if (isMarketWorldModelEnabled()) {
    if (newYork.hour === 17 && newYork.minute < 10) {
      jobs.push(scheduledJob('ingest-world-source', now, { adapterId: 'ai-power-v1' }))
    }
    if (newYork.hour === 18 && newYork.minute < 10) {
      jobs.push(scheduledJob('compile-world-baseline', now, { scopeType: 'global', scopeKey: 'global' }))
    }
    if (newYork.hour === 20 && newYork.minute < 10) {
      jobs.push(scheduledJob('synthesize-market-hypotheses', now))
    }
    if (newYork.hour % 6 === 0 && newYork.minute < 10) {
      jobs.push(scheduledJob('refresh-market-hypothesis-research', now))
    }
    if (newYork.weekday === 'Sun' && newYork.hour === 18 && newYork.minute < 10) {
      jobs.push(scheduledJob('correlate-market-signals', now, { mode: 'weekly' }))
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

  for (const job of buildDueAgentJobs(now, options)) {
    if (lastScheduledKeys.get(job.jobType) === job.dedupeKey) continue
    const result = await enqueueAgentJob(job.jobType, job.payload, job.dedupeKey)
    lastScheduledKeys.set(job.jobType, job.dedupeKey)
    enqueued.push({ ...job, ...result })
  }

  return enqueued
}
