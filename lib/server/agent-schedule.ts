import {
  buildAgentJobDedupeKey,
  enqueueAgentJob,
  type AgentJobType,
} from './agent-jobs.ts'

export interface ScheduledAgentJob {
  jobType: AgentJobType
  payload: Record<string, unknown>
  dedupeKey: string
}

export interface AgentScheduleOptions {
  includeFmp?: boolean
  includeCodex?: boolean
}

function newYorkParts(now: Date): { weekday: string; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? ''
  return { weekday: part('weekday'), hour: Number(part('hour')), minute: Number(part('minute')) }
}

function isWeekdayAfterMarketClose(now: Date): boolean {
  const { weekday, hour } = newYorkParts(now)
  return weekday !== 'Sat' && weekday !== 'Sun' && hour >= 16
}

export function isUsMarketRefreshWindow(now: Date): boolean {
  const { weekday, hour, minute } = newYorkParts(now)
  if (weekday === 'Sat' || weekday === 'Sun') return false
  const minutes = hour * 60 + minute
  return minutes >= 9 * 60 + 30 && minutes <= 16 * 60 + 5
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
  const jobs = [
    scheduledJob('sync-market-assets', now),
    scheduledJob('refresh-market-screener', now),
  ]
  if (options.includeFmp !== false) {
    jobs.push(scheduledJob('refresh-fmp-intelligence', now))
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
    jobs.push(scheduledJob('scan-research-refreshes', now))
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
