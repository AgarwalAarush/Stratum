import { dispatchCompanyWorldReceipts } from '../lib/server/company-world-memory.ts'
import { execFileSync } from 'node:child_process'
import { writeWorkerLocalHealth, safeWorkerError } from '../lib/server/worker-local-health.ts'
import { AgentJobPool } from '../lib/server/agent-job-pool.ts'
import { workerClaimsPaused, verifyWorkerSchema, WORKER_HEALTH_MAX_AGE_MS } from '../lib/server/worker-release-control.ts'
import { workerProgressState } from '../lib/server/worker-watchdog.ts'
import { hostname } from 'node:os'
import { enqueueAgentJob } from '../lib/server/agent-job-queue.ts'
import { resumeBlockedAgentJobs, processOneAgentJob, recoverInterruptedAgentJobs, recoverStaleAgentJobs, supersedeQueuedRoutineAgentJobs } from '../lib/server/agent-jobs.ts'
import { enqueueDueAgentJobs } from '../lib/server/agent-schedule.ts'
import { recordWorkerHeartbeat } from '../lib/server/worker-heartbeat.ts'
import type { AgentJobType } from '../lib/server/agent-job-contracts.ts'
import { workerJobConcurrency } from '../lib/server/market-model-policy.ts'
import { isRobinhoodPortfolioSyncConfigured } from '../lib/server/robinhood-portfolio-sync.ts'
import { ensureDeclaredMarketDomainPacks } from '../lib/server/world-source-control.ts'
import { ensureWorldCoverageFrontiers } from '../lib/server/world-coverage.ts'

// Derive release identity from the checkout, rather than carrying an old env value.
process.env.STRATUM_RELEASE_SHA = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()

const POLL_INTERVAL_MS = Number(process.env.WORKER_POLL_INTERVAL_MS ?? 5_000)
const SCHEDULER_INTERVAL_MS = Number(process.env.WORKER_SCHEDULER_INTERVAL_MS ?? 60_000)
const HEARTBEAT_INTERVAL_MS = Number(process.env.WORKER_HEARTBEAT_INTERVAL_MS ?? 60_000)
const WORKER_SHUTDOWN_GRACE_MS = Math.max(1_000, Math.min(60_000, Number(process.env.WORKER_SHUTDOWN_GRACE_MS ?? 15_000)))
const WORKER_CONCURRENCY = workerJobConcurrency()
const schedulerEnabled = process.env.WORKER_SCHEDULER_ENABLED !== 'false'
const fmpEnabled = Boolean(process.env.FMP_API_KEY)
const codexEnabled = process.env.CODEX_SYNTHESIS_ENABLED !== 'false'
const worldThinkerEnabled = codexEnabled && process.env.STRATUM_WORLD_THINKER_ENABLED !== 'false'
const robinhoodEnabled = isRobinhoodPortfolioSyncConfigured()
const workerId = process.env.WORKER_ID ?? `${hostname()}:${process.pid}`
const runOnce = process.argv.includes('--once')
const lastScheduledKeys = new Map<AgentJobType, string>()
let consecutiveFailures = 0
let stopping = false
let nextScheduleAt = 0
let nextHeartbeatAt = 0
let nextRecoveryAt = 0
let nextQueueReconcileAt = 0
let shutdownTimer: NodeJS.Timeout | null = null
let lastLoopAt = Date.now()
let databaseCheckedAt: string | null = null
let schema: 'ready' | 'unverified' = 'unverified'
let nextSchemaCheckAt = 0
let paused = true
const pool = new AgentJobPool(async () => {
  if (stopping || schema !== 'ready' || await workerClaimsPaused()) return false
  return processOneAgentJob(workerId)
})

async function publishHealth(error?: string) {
  const databaseFresh = databaseCheckedAt !== null && Date.now() - Date.parse(databaseCheckedAt) < WORKER_HEALTH_MAX_AGE_MS
  await writeWorkerLocalHealth({ workerId, status: !error && !consecutiveFailures && databaseFresh && schema === 'ready' ? 'healthy' : 'degraded',
    consecutiveFailures, ...(error ? { error } : {}), ...workerProgressState(lastLoopAt), databaseCheckedAt, schema,
    claiming: !paused && !stopping, activeAttempts: pool.active,
    drained: (paused || stopping) && pool.active === 0 && !maintenanceRunning, releaseControlVersion: 1 })
}

function requestStop(signal: 'SIGINT' | 'SIGTERM') {
  if (stopping) return
  stopping = true
  console.info(JSON.stringify({ level: 'info', workerId, event: 'shutdown_requested', signal, graceMs: WORKER_SHUTDOWN_GRACE_MS }))
  // A network call can ignore cancellation. Leave the persistent job in its
  // recoverable running state rather than letting a release hang forever;
  // launchd restarts the stable wrapper and startup recovery records the retry.
  shutdownTimer = setTimeout(() => {
    console.error(JSON.stringify({ level: 'error', workerId, event: 'shutdown_forced_after_grace' }))
    process.exit(0)
  }, WORKER_SHUTDOWN_GRACE_MS)
  shutdownTimer.unref()
}

process.on('SIGINT', () => requestStop('SIGINT'))
process.on('SIGTERM', () => requestStop('SIGTERM'))

async function heartbeat(): Promise<void> {
  if (Date.now() < nextHeartbeatAt) return
  nextHeartbeatAt = Date.now() + HEARTBEAT_INTERVAL_MS
  try {
    await recordWorkerHeartbeat({ workerId, schedulerEnabled, fmpEnabled, codexEnabled })
    databaseCheckedAt = new Date().toISOString()
    if (Date.now() >= nextSchemaCheckAt) {
      schema = 'unverified'
      await verifyWorkerSchema()
      schema = 'ready'
      nextSchemaCheckAt = Date.now() + 60_000
    }
    const progress = workerProgressState(lastLoopAt)
    await publishHealth(progress.stalled ? 'Worker control loop stalled' : undefined)
    if (progress.stalled) {
      console.error(JSON.stringify({ event: 'worker_control_loop_stalled', workerId, ...progress }))
      process.exit(1)
    }
  } catch (error) {
    databaseCheckedAt = null
    await publishHealth(safeWorkerError(error))
    console.warn(JSON.stringify({
      level: 'warn',
      workerId,
      event: 'heartbeat_failed',
      error: safeWorkerError(error),
    }))
  }
}

let maintenanceRunning=false
async function maintenance(){
  if(maintenanceRunning||stopping)return
  maintenanceRunning=true
  try{
    await heartbeat()
      paused = await workerClaimsPaused()
      if (!paused && schema === 'ready' && schedulerEnabled && Date.now() >= nextScheduleAt) {
        const scheduled = await enqueueDueAgentJobs(new Date(), lastScheduledKeys, {
          includeFmp: fmpEnabled,
          includeCodex: codexEnabled,
          includeNewsletter: process.env.STRATUM_NEWSLETTER_ENABLED === 'true',
          includeRobinhood: robinhoodEnabled,
          includeWorldThinker: worldThinkerEnabled,
        })
        if(worldThinkerEnabled && codexEnabled) await dispatchCompanyWorldReceipts((payload,key,priority)=>enqueueAgentJob('run-world-thinker',payload,key,{priority}))
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
  } finally {maintenanceRunning=false}
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
  console.info(JSON.stringify({ level: 'info', workerId, event: 'worker_concurrency', concurrency: WORKER_CONCURRENCY }))
  // A restarted release acknowledges the barrier before any startup mutations.
  while ((paused = await workerClaimsPaused()) || schema !== 'ready') {
    lastLoopAt = Date.now()
    await heartbeat()
    await publishHealth()
    if (stopping) return
    if (runOnce) throw new Error('Worker claims are paused or required schema is unavailable')
    await new Promise(resolve => setTimeout(resolve, 1_000))
  }
  const domainSync = await ensureDeclaredMarketDomainPacks()
  if (worldThinkerEnabled) await ensureWorldCoverageFrontiers()
  if (domainSync.inserted.length > 0 || domainSync.upgraded.length > 0) {
    console.info(JSON.stringify({ level: 'info', workerId, event: 'market_domain_packs_synchronized', ...domainSync }))
  }
  if (domainSync.inserted.length > 0) {
    // A code-reviewed declaration earns one durable coverage-planning pass,
    // not automatic source admission. The planner is deduplicated daily and
    // each resulting scout remains capped to direct canonical candidates.
    const coverageReview = await enqueueAgentJob('review-world-source-coverage', {
      trigger: 'declared-domain-bootstrap', domainIds: domainSync.inserted,
    })
    console.info(JSON.stringify({
      level: 'info', workerId, event: 'declared_domain_coverage_review_queued',
      domainIds: domainSync.inserted, jobId: coverageReview.id, deduplicated: coverageReview.deduplicated,
    }))
  }
  const restartedJobs = await recoverInterruptedAgentJobs(workerId)
  if (restartedJobs > 0) {
    console.info(JSON.stringify({
      level: 'info',
      workerId,
      event: 'interrupted_jobs_recovered',
      count: restartedJobs,
    }))
  }
  const recoveredJobs = await recoverStaleAgentJobs()
  if (recoveredJobs > 0) console.info(JSON.stringify({ level: 'info', workerId, event: 'stale_jobs_recovered', count: recoveredJobs }))
  const supersededJobs = await supersedeQueuedRoutineAgentJobs()
  if (supersededJobs > 0) console.info(JSON.stringify({ level: 'info', workerId, event: 'routine_queue_superseded', count: supersededJobs }))

  // Keep heartbeat and daily scheduling independent of a long research job.
  const maintenanceTimer=runOnce?null:setInterval(()=>{
    void maintenance().catch(error=>console.warn(JSON.stringify({event:'worker_maintenance_failed',error:safeWorkerError(error)})))
  },Math.min(HEARTBEAT_INTERVAL_MS,SCHEDULER_INTERVAL_MS))
  try { do {
    lastLoopAt = Date.now()
    try {
      await maintenance()
      paused = await workerClaimsPaused()
      if (paused || schema !== 'ready') {
        await publishHealth()
        if (runOnce) return
        await new Promise(resolve => setTimeout(resolve, 1_000))
        continue
      }
      if (Date.now() >= nextRecoveryAt) {
        await resumeBlockedAgentJobs()
        const recovered = await recoverStaleAgentJobs()
        if (recovered > 0) console.info(JSON.stringify({ level: 'info', workerId, event: 'stale_jobs_recovered', count: recovered }))
        nextRecoveryAt = Date.now() + 60_000
      }
      if (Date.now() >= nextQueueReconcileAt) {
        const superseded = await supersedeQueuedRoutineAgentJobs()
        if (superseded > 0) console.info(JSON.stringify({ level: 'info', workerId, event: 'routine_queue_superseded', count: superseded }))
        nextQueueReconcileAt = Date.now() + 60_000
      }
      const processed = runOnce ? Number(await processOneAgentJob(workerId)) : await pool.next(WORKER_CONCURRENCY)
      consecutiveFailures = 0
      await publishHealth()
      if (runOnce) return
      if (!processed) await new Promise((resolve) => setTimeout(resolve, Math.min(60000, POLL_INTERVAL_MS * 2 ** Math.min(consecutiveFailures,4))))
    } catch (error) {
      consecutiveFailures += 1
      const message = safeWorkerError(error)
      await publishHealth(message)
      console.error(JSON.stringify({ level: 'error', workerId, error: message.includes('<!DOCTYPE') ? 'Database gateway returned HTML; service unavailable' : message.slice(0,1000), consecutiveFailures }))
      if (runOnce) throw error
      await new Promise((resolve) => setTimeout(resolve, Math.min(60000, POLL_INTERVAL_MS * 2 ** Math.min(consecutiveFailures,4))))
    }
  } while (!stopping) } finally { if(maintenanceTimer)clearInterval(maintenanceTimer) }
  // Pending isolated attempts own their slots until their process groups exit.
  while (pool.active || maintenanceRunning) {
    await publishHealth()
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  await publishHealth()
  if (shutdownTimer) clearTimeout(shutdownTimer)
}

await writeWorkerLocalHealth({workerId,status:'starting',consecutiveFailures})
try { await main() } catch(error) {
  await writeWorkerLocalHealth({workerId,status:'degraded',consecutiveFailures:consecutiveFailures+1,error:safeWorkerError(error)})
  console.error(JSON.stringify({event:'worker_startup_failed',error:safeWorkerError(error)}))
  process.exitCode=1
}
