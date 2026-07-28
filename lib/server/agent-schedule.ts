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

export function buildDueAgentJobs(now = new Date()): ScheduledAgentJob[] {
  const jobs = [
    scheduledJob('sync-market-assets', now),
    scheduledJob('refresh-market-screener', now),
    scheduledJob('refresh-fmp-intelligence', now),
  ]
  const utcHour = now.getUTCHours()

  if (utcHour >= 12) jobs.push(scheduledJob('generate-morning-brief', now))
  if (now.getUTCDay() === 1 && utcHour >= 13) jobs.push(scheduledJob('generate-weekly-overview', now))
  if ([1, 15].includes(now.getUTCDate()) && utcHour >= 14) {
    jobs.push(scheduledJob('generate-monthly-overview', now))
  }

  return jobs
}

export async function enqueueDueAgentJobs(
  now = new Date(),
  lastScheduledKeys = new Map<AgentJobType, string>(),
): Promise<Array<ScheduledAgentJob & { id: string; deduplicated: boolean }>> {
  const enqueued = []

  for (const job of buildDueAgentJobs(now)) {
    if (lastScheduledKeys.get(job.jobType) === job.dedupeKey) continue
    const result = await enqueueAgentJob(job.jobType, job.payload, job.dedupeKey)
    lastScheduledKeys.set(job.jobType, job.dedupeKey)
    enqueued.push({ ...job, ...result })
  }

  return enqueued
}
