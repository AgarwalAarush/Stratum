import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import ts from 'typescript'
import { claimGateDrainBlockers, descendantProcessIds, pauseWorkerClaims, releaseHealthBlockers, verifyWorkerSchema, workerClaimsPaused } from '../lib/server/worker-release-control.ts'

test('durable pause blocks claims across restarts and fails closed for damaged records', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'stratum-release-pause-'))
  const path = join(directory, 'health', 'pause.json')
  try {
    assert.equal(await workerClaimsPaused(path), false)
    await pauseWorkerClaims(path)
    assert.equal(await workerClaimsPaused(path), true)
    assert.equal(JSON.parse(await readFile(path, 'utf8')).version, 1)
    await writeFile(path, 'damaged')
    assert.equal(await workerClaimsPaused(path), true)
    await unlink(path)
    assert.equal(await workerClaimsPaused(path), false)
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('resume requires same release, schema, live database evidence and complete drain', () => {
  const now = Date.parse('2026-10-03T23:00:00Z'), release = 'a'.repeat(40)
  const health = { release, checkedAt: new Date(now).toISOString(), databaseCheckedAt: new Date(now).toISOString(),
    status: 'healthy', schema: 'ready', releaseControlVersion: 1, activeAttempts: 0, claiming: false, drained: true }
  assert.deepEqual(releaseHealthBlockers(health, release, true, now), [])
  for (const patch of [{ release: 'b'.repeat(40) }, { schema: 'unverified' }, { status: 'degraded' },
    { databaseCheckedAt: new Date(now - 180_001).toISOString() }, { checkedAt: new Date(now + 1000).toISOString() },
    { activeAttempts: 1 }, { claiming: true }, { drained: false }, { releaseControlVersion: undefined }]) {
    assert.ok(releaseHealthBlockers({ ...health, ...patch }, release, true, now).length, JSON.stringify(patch))
  }
  assert.ok(releaseHealthBlockers({ status: 'healthy', release, checkedAt: health.checkedAt }, release, true, now).length)
})

test('legacy handoff requires authoritative paused claims and terminal jobs and attempts', () => {
  const release = 'a'.repeat(40), gate = { paused: true, reason: 'Release', expected_release_sha: release,
    running_jobs: 0, running_attempts: 0, checked_at: new Date().toISOString() }
  assert.deepEqual(claimGateDrainBlockers(gate, release), [])
  for (const patch of [{ paused: false }, { expected_release_sha: 'b'.repeat(40) }, { running_jobs: 1 }, { running_attempts: 1 }]) {
    assert.ok(claimGateDrainBlockers({ ...gate, ...patch }, release).length)
  }
})

test('drain snapshots include nested descendants even with independent process groups', () => {
  assert.deepEqual(descendantProcessIds([{ pid: 50, parent: 40 }, { pid: 10, parent: 1 },
    { pid: 40, parent: 30 }, { pid: 30, parent: 20 }, { pid: 20, parent: 10 }, { pid: 99, parent: 1 }], 10).sort((a,b) => a-b), [20, 30, 40, 50])
})

test('schema verification fails closed and its freeze probe cannot publish a manifest', async t => {
  const previous = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY }
  process.env.SUPABASE_URL = 'https://worker-release-test.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
  t.after(() => { for (const [key, value] of [['SUPABASE_URL', previous.url], ['SUPABASE_SERVICE_ROLE_KEY', previous.key]] as const) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value
  } })
  let missing = false
  t.mock.method(globalThis, 'fetch', async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = new URL(String(input))
    if (url.pathname.endsWith('/rpc/worker_claim_gate_status')) return Response.json({ paused: false, reason: null,
      expected_release_sha: null, running_jobs: 0, running_attempts: 0, checked_at: new Date().toISOString() })
    if (url.pathname.endsWith('/rpc/freeze_recommendation_input')) {
      assert.deepEqual(JSON.parse(String(init?.body)), { p_manifest: null })
      return Response.json({ code: 'P0001', message: 'Invalid bounded recommendation manifest' }, { status: 400 })
    }
    assert.equal(url.searchParams.get('limit'), '0')
    return missing ? Response.json({ message: 'Missing aging columns' }, { status: 400 }) : Response.json([])
  })
  await verifyWorkerSchema()
  missing = true
  await assert.rejects(verifyWorkerSchema(), /Required worker schema is unavailable/)
})

test('actual worker maintenance dispatches company receipts with provenance and priority only when scheduling is ready', async () => {
  const source = await readFile(new URL('../scripts/markets-worker.ts', import.meta.url), 'utf8')
  const syntax = ts.createSourceFile('markets-worker.ts', source, ts.ScriptTarget.Latest, true)
  const maintenance = syntax.statements.find(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === 'maintenance')
  assert.ok(maintenance)
  // Execute the production function without importing the worker's startup side effects.
  const run = new Function('bindings', `
    const {heartbeat,workerClaimsPaused,schema,schedulerEnabled,lastScheduledKeys,enqueueDueAgentJobs,
      fmpEnabled,codexEnabled,robinhoodEnabled,worldThinkerEnabled,dispatchCompanyWorldReceipts,
      enqueueAgentJob,SCHEDULER_INTERVAL_MS,workerId,console}=bindings;
    let maintenanceRunning=false,stopping=false,paused=false,nextScheduleAt=0;
    ${maintenance.getText(syntax)}
    return maintenance();
  `) as (bindings: Record<string, unknown>) => Promise<void>
  const receipt = { trigger: 'company_research', researchNoteId: 'accepted-report', symbol: 'ABC' }
  const dedupeKey = 'run-world-thinker:company-research:accepted-report'
  for (const scenario of [
    { paused: true, schema: 'ready', enabled: true, expected: false },
    { paused: false, schema: 'unverified', enabled: true, expected: false },
    { paused: false, schema: 'ready', enabled: false, expected: false },
    { paused: false, schema: 'ready', enabled: true, expected: true },
  ]) {
    const jobs: unknown[][] = []
    let scheduled = 0
    await run({ heartbeat: async () => {}, workerClaimsPaused: async () => scenario.paused,
      schema: scenario.schema, schedulerEnabled: true, lastScheduledKeys: new Map(),
      enqueueDueAgentJobs: async () => { scheduled++; return [] }, fmpEnabled: true, codexEnabled: true,
      robinhoodEnabled: false, worldThinkerEnabled: scenario.enabled,
      dispatchCompanyWorldReceipts: async (enqueue: (payload: typeof receipt, key: string, priority: number) => Promise<unknown>) => enqueue(receipt, dedupeKey, 24),
      enqueueAgentJob: async (...args: unknown[]) => { jobs.push(args); return { id: 'queued', deduplicated: false } },
      SCHEDULER_INTERVAL_MS: 60_000, workerId: 'test-worker', console: { info: () => {} } })
    assert.equal(scheduled, !scenario.paused && scenario.schema === 'ready' ? 1 : 0)
    assert.deepEqual(jobs, scenario.expected ? [['run-world-thinker', receipt, dedupeKey, { priority: 24 }]] : [])
  }
})
