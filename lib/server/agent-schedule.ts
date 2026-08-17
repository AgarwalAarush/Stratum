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
  includeWorldThinker?: boolean
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
  if (options.includeWorldThinker === true) {
    jobs.push(scheduledJob('refresh-world-events', now))
    if ((newYork.hour === 6 || newYork.hour === 18) && newYork.minute < 10) {
      jobs.push(scheduledJob('run-world-thinker', now, { trigger: 'scheduled' }))
    }
  }
  // Research existing exposure before adjacent discovery. This run only creates
  // durable company-research jobs; it cannot create an investment decision.
  if (newYork.hour === 6 && newYork.minute >= 10 && newYork.minute < 20) {
    jobs.push(scheduledJob('seed-portfolio-company-research', now))
  }
  // The optional adapters value keeps schedule tests independent of process
  // environment. Production resolves durable active domains inside the cycle.
  if (isMarketWorldModelEnabled() || options.worldSourceAdapters !== undefined) {
    const cycle = newYork.hour === 6 ? 'pre-market' : newYork.hour === 18 ? 'post-close' : null
    if (cycle && newYork.minute < 10) {
      // A cycle owns sources -> baseline -> hypothesis correlation -> research
      // routing. Independent wall-clock jobs race and can only inspect stale
      // state, which is not a meaningful refresh.
      jobs.push(scheduledJob('run-market-thesis-cycle', now, { cycle, cycleDate: newYork.date }))
    }
    // Keep health remediation and discovery-only cross-workspace referrals
    // outside the coordinated research cycle. A referral can prompt governed
    // source admission, but cannot become thesis evidence by itself.
    if (newYork.hour === 16 && newYork.minute < 10) {
      jobs.push(scheduledJob('verify-world-source-health', now))
    }
    if (newYork.hour === 17 && newYork.minute >= 35 && newYork.minute < 45) {
      // Feed items may suggest a place to investigate, but the resulting
      // referral remains outside governed evidence until a human starts a
      // separate candidate/contract review.
      jobs.push(scheduledJob('scan-intelligence-source-referrals', now))
    }
    if (newYork.hour % 6 === 0 && newYork.minute < 10) {
      // The orchestrator is the sole 6h research control plane. It auto-accepts
      // eligible proposals, then enqueues bounded child jobs (scout, collect,
      // critic, prediction eval) under explicit cost caps.
      // The coordinated cycles run their own planner after their fresh
      // source-to-hypothesis chain has completed.
      if (newYork.hour !== 6 && newYork.hour !== 18) jobs.push(scheduledJob('orchestrate-market-research', now))
    }
    // The coordinated post-close cycle already performs the weekly correlation
    // pass on Sundays, so do not run a competing standalone correlation job.
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
  for (const job of buildDueAgentJobs(now, options)) {
    if (lastScheduledKeys.get(job.jobType) === job.dedupeKey) continue
    const result = await enqueueAgentJob(job.jobType, job.payload, job.dedupeKey)
    lastScheduledKeys.set(job.jobType, job.dedupeKey)
    enqueued.push({ ...job, ...result })
  }

  return enqueued
}
