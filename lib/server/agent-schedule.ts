import {
  buildAgentJobDedupeKey,
  enqueueAgentJob,
  type AgentJobType,
} from './agent-jobs.ts'
import {
  fmpIntelligenceCadenceMinutes,
  isUsMarketRefreshWindow,
  isWeekdayAfterMarketClose,
} from '../markets/market-clock.ts'

export interface ScheduledAgentJob {
  jobType: AgentJobType
  payload: Record<string, unknown>
  dedupeKey: string
}

export interface AgentScheduleOptions {
  includeFmp?: boolean
  includeCodex?: boolean
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
