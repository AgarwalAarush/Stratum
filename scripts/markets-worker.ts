import { hostname } from 'node:os'
import { processOneAgentJob } from '../lib/server/agent-jobs.ts'
import { enqueueDueAgentJobs } from '../lib/server/agent-schedule.ts'
import type { AgentJobType } from '../lib/server/agent-jobs.ts'

const POLL_INTERVAL_MS = Number(process.env.WORKER_POLL_INTERVAL_MS ?? 5_000)
const SCHEDULER_INTERVAL_MS = Number(process.env.WORKER_SCHEDULER_INTERVAL_MS ?? 60_000)
const schedulerEnabled = process.env.WORKER_SCHEDULER_ENABLED !== 'false'
const fmpEnabled = Boolean(process.env.FMP_API_KEY)
const codexEnabled = process.env.CODEX_SYNTHESIS_ENABLED !== 'false'
const workerId = process.env.WORKER_ID ?? `${hostname()}:${process.pid}`
const runOnce = process.argv.includes('--once')
const lastScheduledKeys = new Map<AgentJobType, string>()
let stopping = false
let nextScheduleAt = 0

process.on('SIGINT', () => { stopping = true })
process.on('SIGTERM', () => { stopping = true })

async function main() {
  if (schedulerEnabled && !fmpEnabled) {
    console.warn(JSON.stringify({
      level: 'warn',
      workerId,
      event: 'provider_disabled',
      provider: 'fmp',
      reason: 'FMP_API_KEY is not configured',
    }))
  }
  if (schedulerEnabled && !codexEnabled) {
    console.warn(JSON.stringify({
      level: 'warn',
      workerId,
      event: 'provider_disabled',
      provider: 'codex',
      reason: 'CODEX_SYNTHESIS_ENABLED is false',
    }))
  }

  do {
    try {
      if (schedulerEnabled && Date.now() >= nextScheduleAt) {
        const scheduled = await enqueueDueAgentJobs(new Date(), lastScheduledKeys, {
          includeFmp: fmpEnabled,
          includeCodex: codexEnabled,
        })
        nextScheduleAt = Date.now() + SCHEDULER_INTERVAL_MS
        for (const job of scheduled) {
          console.info(JSON.stringify({
            level: 'info',
            workerId,
            event: job.deduplicated ? 'job_already_scheduled' : 'job_scheduled',
            jobType: job.jobType,
            jobId: job.id,
            dedupeKey: job.dedupeKey,
          }))
        }
      }
      const processed = await processOneAgentJob(workerId)
      if (runOnce) return
      if (!processed) await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
    } catch (error) {
      console.error(JSON.stringify({ level: 'error', workerId, error: error instanceof Error ? error.message : String(error) }))
      if (runOnce) throw error
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
    }
  } while (!stopping)
}

await main()
