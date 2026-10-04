import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { getSupabaseClient } from './supabase.ts'

export const WORKER_HEALTH_MAX_AGE_MS = 180_000
export const workerHealthDirectory = () => join(process.env.STRATUM_DATA_ROOT || '/Users/Shared/StratumData', 'health')
export const workerPauseFile = () => join(workerHealthDirectory(), 'worker-pause.json')

export interface WorkerClaimGateStatus {
  paused: boolean
  reason: string | null
  expected_release_sha: string | null
  running_jobs: number
  running_attempts: number
  checked_at: string
}

/** Narrow compatibility adapter until generated database types include the gate. */
function gateStatus(value: unknown): WorkerClaimGateStatus {
  const status = value as Partial<WorkerClaimGateStatus> | null
  if (!status || typeof status.paused !== 'boolean' || !Number.isInteger(status.running_jobs) || Number(status.running_jobs) < 0
    || !Number.isInteger(status.running_attempts) || Number(status.running_attempts) < 0
    || typeof status.checked_at !== 'string' || !Number.isFinite(Date.parse(status.checked_at))
    || !(status.reason === null || typeof status.reason === 'string')
    || !(status.expected_release_sha === null || typeof status.expected_release_sha === 'string' && /^[a-f0-9]{40}$/.test(status.expected_release_sha))) {
    throw new Error('Worker claim gate returned invalid evidence')
  }
  return status as WorkerClaimGateStatus
}

export async function workerClaimGateStatus(): Promise<WorkerClaimGateStatus> {
  const db = getSupabaseClient()
  if (!db) throw new Error('Supabase service credentials are not configured')
  const result = await db.rpc('worker_claim_gate_status').abortSignal(AbortSignal.timeout(15_000))
  if (result.error) throw new Error(`Worker claim gate is unavailable: ${result.error.message}`)
  return gateStatus(result.data)
}

export async function setWorkerClaimGate(paused: boolean, release: string): Promise<WorkerClaimGateStatus> {
  if (!/^[a-f0-9]{40}$/.test(release)) throw new Error('An exact release SHA is required')
  const db = getSupabaseClient()
  if (!db) throw new Error('Supabase service credentials are not configured')
  const result = await db.rpc('set_worker_claim_gate', { p_paused: paused,
    p_reason: paused ? 'Coordinated release transition' : null, p_expected_release_sha: release }).abortSignal(AbortSignal.timeout(15_000))
  if (result.error) throw new Error(`Worker claim gate transition failed: ${result.error.message}`)
  const status = gateStatus(result.data)
  if (status.paused !== paused || paused && status.expected_release_sha !== release) throw new Error('Worker claim gate did not acknowledge the requested transition')
  return status
}

export function claimGateDrainBlockers(gate: WorkerClaimGateStatus, release: string): string[] {
  return [!gate.paused ? 'Database claims are not paused' : null,
    gate.expected_release_sha !== release ? 'Claim gate release does not match the staged SHA' : null,
    gate.running_jobs || gate.running_attempts ? 'Database jobs and attempts have not drained' : null].filter((value): value is string => value !== null)
}

/** Presence is authoritative, even if a damaged pause record cannot be parsed. */
export async function workerClaimsPaused(path = workerPauseFile()): Promise<boolean> {
  try { await readFile(path); return true } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

export function descendantProcessIds(processes: Array<{ pid: number; parent: number }>, supervisorPid: number): number[] {
  const descendants = new Set<number>(), parents = new Set([supervisorPid])
  let expanded = true
  while (expanded) {
    expanded = false
    for (const process of processes) if (parents.has(process.parent) && !parents.has(process.pid)) {
      descendants.add(process.pid); parents.add(process.pid); expanded = true
    }
  }
  return [...descendants]
}

export async function pauseWorkerClaims(path = workerPauseFile(), snapshot?: { supervisorPid: number; trackedPids: number[] }): Promise<void> {
  await mkdir(join(path, '..'), { recursive: true, mode: 0o700 })
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`
  await writeFile(temporary, JSON.stringify({ version: 1, pausedAt: new Date().toISOString(), ...snapshot }), { mode: 0o600 })
  await rename(temporary, path)
}

type Health = Record<string, unknown>
export function releaseHealthBlockers(state: Health, release: string, requireDrained = false, now = Date.now()): string[] {
  const blockers: string[] = []
  const fresh = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value)) && now - Date.parse(value) >= 0 && now - Date.parse(value) < WORKER_HEALTH_MAX_AGE_MS
  if (!/^[a-f0-9]{40}$/.test(release) || state.release !== release) blockers.push('Worker release does not match the required SHA')
  if (!fresh(state.checkedAt)) blockers.push('Worker health is missing or stale')
  if (state.status !== 'healthy' || !fresh(state.databaseCheckedAt)) blockers.push('A fresh successful database heartbeat is required')
  if (state.schema !== 'ready') blockers.push('Required worker schema is unverified')
  if (state.releaseControlVersion !== 1) blockers.push('Worker does not support guarded release activation')
  if (!Number.isInteger(state.activeAttempts) || Number(state.activeAttempts) < 0) blockers.push('Active attempt count is unverified')
  if (requireDrained && (state.claiming !== false || state.drained !== true || state.activeAttempts !== 0)) blockers.push('Worker claims and maintenance must be paused and all attempts drained')
  return blockers
}

/** Read-only probes: the invalid freeze payload must fail before any insert. */
export async function verifyWorkerSchema(): Promise<void> {
  const db = getSupabaseClient()
  if (!db) throw new Error('Supabase service credentials are not configured')
  const signal = AbortSignal.timeout(15_000)
  const checks = await Promise.all([
    db.from('recommendation_evaluation_tasks').select('checkpoint_date,retrospective,evaluator_version').limit(0).abortSignal(signal),
    db.from('research_investigation_slots').select('*').limit(0).abortSignal(signal),
    db.from('company_world_memory_receipts').select('*').limit(0).abortSignal(signal),
    db.rpc('freeze_recommendation_input', { p_manifest: null }).abortSignal(signal),
    db.rpc('worker_claim_gate_status').abortSignal(signal),
  ])
  for (const result of checks.slice(0, 3)) if (result.error) throw new Error(`Required worker schema is unavailable: ${result.error.message}`)
  const freeze = checks[3]
  if (freeze.error?.message !== 'Invalid bounded recommendation manifest') throw new Error('Immutable recommendation freeze is unavailable or rejected incorrectly')
  if (checks[4].error) throw new Error(`Worker claim gate is unavailable: ${checks[4].error.message}`)
  gateStatus(checks[4].data)
}
