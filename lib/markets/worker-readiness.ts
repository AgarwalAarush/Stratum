export const WORKER_HEARTBEAT_MAX_AGE_MS = 180_000

export interface WorkerReadinessObservation {
  workerId: string
  lastSeenAt: string | null
  lastLoopAt: string | null
  releaseSha: string | null
  researchContractVersion: number | null
  healthStatus: string | null
  schedulerEnabled: boolean
  fmpEnabled: boolean
  codexEnabled: boolean
}

export interface ResearchWorkerReadiness {
  checkedAt: string
  database: 'ready' | 'unconfigured' | 'unreachable'
  readinessSchema: 'current' | 'missing' | 'unknown'
  healthy: boolean
  readyForBackfill: boolean
  requiredRelease: string | null
  requiredContractVersion: number
  blockers: string[]
  workers: Array<WorkerReadinessObservation & { heartbeatFresh: boolean; loopFresh: boolean }>
}

function freshAt(value: string | null, now: number): boolean {
  const age = value === null ? Number.NaN : now - Date.parse(value)
  return Number.isFinite(age) && age >= 0 && age <= WORKER_HEARTBEAT_MAX_AGE_MS
}

/** A live process is not evidence that its queue, release or research contract works. */
export function evaluateResearchWorkerReadiness(input: {
  database: ResearchWorkerReadiness['database']
  readinessSchema: ResearchWorkerReadiness['readinessSchema']
  workers: WorkerReadinessObservation[]
  requiredContractVersion: number
  requiredRelease?: string | null
  now?: Date
}): ResearchWorkerReadiness {
  const now = input.now ?? new Date()
  const blockers: string[] = []
  const workers = input.workers.map(worker => ({
    ...worker,
    heartbeatFresh: freshAt(worker.lastSeenAt, now.getTime()),
    loopFresh: freshAt(worker.lastLoopAt, now.getTime()),
  }))
  const active = workers.filter(worker => worker.heartbeatFresh)
  if (input.database !== 'ready') blockers.push(input.database === 'unconfigured'
    ? 'Database credentials are not configured (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).'
    : 'Database could not be reached; worker and output state could not be verified.')
  if (input.readinessSchema !== 'current') blockers.push('Worker release/contract readiness migration is missing or unverified.')
  if (input.database === 'ready' && active.length === 0) blockers.push('No worker has a current persisted heartbeat.')
  for (const worker of active) {
    if (worker.healthStatus !== 'healthy') blockers.push(`Worker ${worker.workerId} reports ${worker.healthStatus ?? 'unknown'} health.`)
    if (!worker.loopFresh) blockers.push(`Worker ${worker.workerId} has no current queue-loop evidence.`)
    if (!worker.fmpEnabled || !worker.codexEnabled) blockers.push(`Worker ${worker.workerId} has research providers disabled or unconfigured.`)
    if (worker.researchContractVersion !== input.requiredContractVersion) blockers.push(`Worker ${worker.workerId} has research contract ${worker.researchContractVersion ?? 'unknown'}; expected ${input.requiredContractVersion}.`)
    if (!worker.releaseSha || worker.releaseSha === 'unknown') blockers.push(`Worker ${worker.workerId} has no verified release identity.`)
    else if (input.requiredRelease && worker.releaseSha !== input.requiredRelease) blockers.push(`Worker ${worker.workerId} release differs from the required release.`)
  }
  const healthy = blockers.length === 0
  if (!input.requiredRelease) blockers.push('An exact required worker release is needed before portfolio backfill.')
  return {
    checkedAt: now.toISOString(),
    database: input.database,
    readinessSchema: input.readinessSchema,
    healthy,
    readyForBackfill: blockers.length === 0,
    requiredRelease: input.requiredRelease ?? null,
    requiredContractVersion: input.requiredContractVersion,
    blockers,
    workers,
  }
}

/** Retain failed database-write evidence even if a later queue tick succeeds. */
export function evaluateWorkerLocalHealth(input: {
  consecutiveFailures: number
  lastLoopAt: number
  lastHeartbeatAt: number | null
  heartbeatError: string | null
  now?: number
}) {
  const now = input.now ?? Date.now()
  const loopAgeSeconds = Math.max(0, Math.floor((now - input.lastLoopAt) / 1_000))
  const heartbeatAge = input.lastHeartbeatAt === null ? Number.NaN : now - input.lastHeartbeatAt
  const database = !input.heartbeatError && Number.isFinite(heartbeatAge) && heartbeatAge >= 0 && heartbeatAge <= WORKER_HEARTBEAT_MAX_AGE_MS
    ? 'ready' as const : 'unverified' as const
  const stalled = loopAgeSeconds > WORKER_HEARTBEAT_MAX_AGE_MS / 1_000
  return {
    status: input.consecutiveFailures === 0 && !stalled && database === 'ready' ? 'healthy' as const : 'degraded' as const,
    database,
    lastHeartbeatAt: input.lastHeartbeatAt === null ? null : new Date(input.lastHeartbeatAt).toISOString(),
    lastLoopAt: new Date(input.lastLoopAt).toISOString(),
    loopAgeSeconds,
    stalled,
    ...(input.heartbeatError ? { error: input.heartbeatError } : {}),
  }
}
