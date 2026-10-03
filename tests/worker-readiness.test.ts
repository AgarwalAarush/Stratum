import assert from 'node:assert/strict'
import test from 'node:test'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { evaluateResearchWorkerReadiness, evaluateWorkerLocalHealth, type WorkerReadinessObservation } from '../lib/markets/worker-readiness.ts'
import { CURRENT_RESEARCH_CONTRACT_VERSION } from '../lib/markets/research-contract.ts'

const now = new Date('2026-10-03T00:00:00Z')
const release = 'a'.repeat(40)
const worker: WorkerReadinessObservation = {
  workerId: 'research-worker:123', lastSeenAt: now.toISOString(), lastLoopAt: now.toISOString(),
  releaseSha: release, researchContractVersion: CURRENT_RESEARCH_CONTRACT_VERSION,
  healthStatus: 'healthy', schedulerEnabled: true, fmpEnabled: true, codexEnabled: true,
}
const ready = (workers = [worker]) => evaluateResearchWorkerReadiness({
  database: 'ready', readinessSchema: 'current', requiredRelease: release,
  requiredContractVersion: CURRENT_RESEARCH_CONTRACT_VERSION, workers, now,
})

test('research preflight requires reachable database and exact current worker release and contract', () => {
  assert.equal(ready().readyForBackfill, true)
  const unavailable = evaluateResearchWorkerReadiness({ database: 'unreachable', readinessSchema: 'unknown',
    requiredRelease: release, requiredContractVersion: CURRENT_RESEARCH_CONTRACT_VERSION, workers: [worker], now })
  assert.equal(unavailable.healthy, false)
  assert.equal(unavailable.readyForBackfill, false)
  assert.match(unavailable.blockers.join(' '), /Database could not be reached/)
  const legacy = ready([{ ...worker, researchContractVersion: null, healthStatus: null }])
  assert.equal(legacy.readyForBackfill, false)
  assert.match(legacy.blockers.join(' '), /unknown/)
})

test('a mixed active release blocks backfill; an expired prior worker does not', () => {
  const old = { ...worker, workerId: 'old:12', releaseSha: 'b'.repeat(40) }
  assert.equal(ready([worker, old]).readyForBackfill, false)
  assert.equal(ready([worker, { ...old, lastSeenAt: new Date(now.getTime() - 181_000).toISOString() }]).readyForBackfill, true)
})

test('fresh heartbeat cannot conceal a stalled queue loop or disabled research provider', () => {
  assert.equal(ready([{ ...worker, lastLoopAt: new Date(now.getTime() - 181_000).toISOString() }]).readyForBackfill, false)
  assert.equal(ready([{ ...worker, codexEnabled: false }]).readyForBackfill, false)
  assert.equal(ready([{ ...worker, lastSeenAt: new Date(now.getTime() + 1_000).toISOString() }]).readyForBackfill, false)
})

test('pipeline health without a required release cannot authorize a backfill', () => {
  const status = evaluateResearchWorkerReadiness({ database: 'ready', readinessSchema: 'current',
    requiredContractVersion: CURRENT_RESEARCH_CONTRACT_VERSION, workers: [worker], now })
  assert.equal(status.healthy, true)
  assert.equal(status.readyForBackfill, false)
})

test('a successful queue tick does not erase a failed or missing heartbeat write', () => {
  const input = { consecutiveFailures: 0, lastLoopAt: now.getTime(), now: now.getTime(), lastHeartbeatAt: now.getTime() }
  assert.equal(evaluateWorkerLocalHealth({ ...input, heartbeatError: null }).status, 'healthy')
  const failed = evaluateWorkerLocalHealth({ ...input, heartbeatError: 'Database unavailable' })
  assert.equal(failed.status, 'degraded')
  assert.equal(failed.database, 'unverified')
  assert.equal(evaluateWorkerLocalHealth({ ...input, lastHeartbeatAt: null, heartbeatError: null }).status, 'degraded')
  assert.equal(evaluateWorkerLocalHealth({ ...input, lastHeartbeatAt: now.getTime() - 181_000, heartbeatError: null }).status, 'degraded')
})

test('deployment health command rejects healthy evidence for the wrong release or legacy contract', async () => {
  const root = await mkdtemp(join(tmpdir(), 'stratum-worker-health-'))
  try {
    await mkdir(join(root, 'health'))
    const state = { checkedAt: new Date().toISOString(), status: 'healthy', release, database: 'ready',
      readinessSchema: 'current', researchContractVersion: CURRENT_RESEARCH_CONTRACT_VERSION }
    const write = (value: unknown) => writeFile(join(root, 'health', 'worker.json'), JSON.stringify(value))
    const run = (expected = release) => execFileSync(process.execPath, ['--experimental-strip-types', resolve('scripts/check-worker-health.ts'),
      `--required-release=${expected}`, '--require-research-readiness'], { encoding: 'utf8', env: { ...process.env, STRATUM_DATA_ROOT: root }, stdio: ['ignore', 'pipe', 'pipe'] })
    await write(state)
    assert.equal(JSON.parse(run()).healthy, true)
    assert.throws(() => run('b'.repeat(40)), /Command failed/)
    await write({ ...state, readinessSchema: 'legacy' })
    assert.throws(() => run(), /Command failed/)
  } finally { await rm(root, { recursive: true, force: true }) }
})
