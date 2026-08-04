import { hostname } from 'node:os'
import { processOneAgentJob, recoverStaleAgentJobs } from '../lib/server/agent-jobs.ts'
import { enqueueDueAgentJobs } from '../lib/server/agent-schedule.ts'
import { recordWorkerHeartbeat } from '../lib/server/worker-heartbeat.ts'
import type { AgentJobType } from '../lib/server/agent-jobs.ts'
import { isRobinhoodPortfolioSyncConfigured } from '../lib/server/robinhood-portfolio-sync.ts'

const POLL_INTERVAL_MS = Number(process.env.WORKER_POLL_INTERVAL_MS ?? 5_000)
const SCHEDULER_INTERVAL_MS = Number(process.env.WORKER_SCHEDULER_INTERVAL_MS ?? 60_000)
const HEARTBEAT_INTERVAL_MS = Number(process.env.WORKER_HEARTBEAT_INTERVAL_MS ?? 60_000)
const schedulerEnabled = process.env.WORKER_SCHEDULER_ENABLED !== 'false'
const fmpEnabled = Boolean(process.env.FMP_API_KEY)
const codexEnabled = process.env.CODEX_SYNTHESIS_ENABLED !== 'false'
const robinhoodEnabled = isRobinhoodPortfolioSyncConfigured()
const workerId = process.env.WORKER_ID ?? `${hostname()}:${process.pid}`
const runOnce = process.argv.includes('--once')
const lastScheduledKeys = new Map<AgentJobType, string>()
let stopping = false
let nextScheduleAt = 0
let nextHeartbeatAt = 0
let nextRecoveryAt = 0

process.on('SIGINT', () => { stopping = true })
process.on('SIGTERM', () => { stopping = true })

async function heartbeat(): Promise<void> {
  if (Date.now() < nextHeartbeatAt) return
  nextHeartbeatAt = Date.now() + HEARTBEAT_INTERVAL_MS
  try {
    await recordWorkerHeartbeat({ workerId, schedulerEnabled, fmpEnabled, codexEnabled })
  } catch (error) {
    console.warn(JSON.stringify({
      level: 'warn',
      workerId,
      event: 'heartbeat_failed',
      error: error instanceof Error ? error.message : String(error),
    }))
  }
}

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
  if (schedulerEnabled && !robinhoodEnabled && process.env.ROBINHOOD_SYNC_ENABLED === 'true') {
    console.warn(JSON.stringify({
      level: 'warn',
      workerId,
      event: 'provider_disabled',
      provider: 'robinhood',
      reason: 'Robinhood sync is enabled but its private worker credentials are incomplete',
    }))
  }
  const recoveredJobs = await recoverStaleAgentJobs()
  if (recoveredJobs > 0) {
    console.info(JSON.stringify({
      level: 'info',
      workerId,
      event: 'stale_jobs_recovered',
      count: recoveredJobs,
    }))
  }

  do {
    try {
      await heartbeat()
      if (Date.now() >= nextRecoveryAt) {
        const recovered = await recoverStaleAgentJobs()
        if (recovered > 0) console.info(JSON.stringify({ level: 'info', workerId, event: 'stale_jobs_recovered', count: recovered }))
        nextRecoveryAt = Date.now() + 60_000
      }
      if (schedulerEnabled && Date.now() >= nextScheduleAt) {
        const scheduled = await enqueueDueAgentJobs(new Date(), lastScheduledKeys, {
          includeFmp: fmpEnabled,
          includeCodex: codexEnabled,
          includeRobinhood: robinhoodEnabled,
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
