import test, { type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { isHistoricalReconstructionRun, summarizeHistoricalReconstruction } from '../lib/markets/world-reconstruction.ts'
import { processWorldReplayStep, resumeWorldReplay, startWorldReplay } from '../lib/server/world-replay.ts'

const since = '2025-10-03T00:00:00.000Z'
const week2 = '2025-10-10T00:00:00.000Z'
const until = '2025-10-17T00:00:00.000Z'
const row = {
  id: 'new-run', status: 'failed', branch: 'reconstruction/new-run', since_at: since, until_at: until, cursor_at: week2,
  weeks_total: 2, weeks_completed: 49, weeks_verified: 49, weeks_projected: 49, weeks_uncovered: 0,
  sources_scanned: 9_999, clusters_retained: 900, search_gap_weeks: 8, error: 'Old error',
}

test('legacy World replay is distinct from isolated reconstruction', () => {
  assert.equal(isHistoricalReconstructionRun({ branch: 'shadow/world-thinker' }), false)
  assert.equal(isHistoricalReconstructionRun({ branch: 'reconstruction/new-run' }), true)
})

test('reconstruction retries count each persisted window once and exclude future windows', () => {
  const first = { week_start: since, week_end: week2, source_count: 3, status: 'screened' }
  const second = { week_start: week2, week_end: until, source_count: 0, status: 'documented_empty' }
  assert.deepEqual(summarizeHistoricalReconstruction(since, until, [first, first, second]), {
    weeksCompleted: 2, weeksVerified: 1, weeksUncovered: 1, sourcesScanned: 3,
  })
  assert.deepEqual(summarizeHistoricalReconstruction(since, week2, [first, second]), {
    weeksCompleted: 1, weeksVerified: 1, weeksUncovered: 0, sourcesScanned: 3,
  })
})

test('unresolved or missing windows cannot count as completed reconstruction', () => {
  assert.throws(() => summarizeHistoricalReconstruction(since, until, [
    { week_start: week2, week_end: until, source_count: 3, status: 'screened' },
  ]), /unresolved window/)
  assert.throws(() => summarizeHistoricalReconstruction(since, week2, [
    { week_start: since, week_end: week2, source_count: 3, status: 'failed' },
  ]), /unresolved window/)
})

test('partial final windows retain coverage counts and reject invalid ranges', () => {
  const partial = '2025-10-12T00:00:00.000Z'
  assert.deepEqual(summarizeHistoricalReconstruction(since, partial, [
    { week_start: since, week_end: week2, source_count: 0, status: 'documented_empty' },
    { week_start: week2, week_end: partial, source_count: 2, status: 'screened' },
  ]), { weeksCompleted: 2, weeksVerified: 1, weeksUncovered: 1, sourcesScanned: 2 })
  assert.throws(() => summarizeHistoricalReconstruction(until, since, []), /valid time range/)
})

// Exercise the real Supabase call chain without any production access.
process.env.SUPABASE_URL = 'https://reconstruction-tests.invalid'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-key'
type ResponseSpec = { body: unknown; status?: number }
function mockDatabase(t: TestContext, responses: ResponseSpec[]) {
  const calls: { url: URL; method: string; body: Record<string, unknown> | null }[] = []
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const response = responses.shift()
    assert.ok(response, 'Unexpected database request')
    calls.push({ url: new URL(String(input)), method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : null })
    return new Response(JSON.stringify(response.body), { status: response.status ?? 200, headers: { 'Content-Type': 'application/json' } })
  })
  t.after(() => assert.equal(responses.length, 0, 'Expected database requests did not happen'))
  return calls
}

test('worker rejects a legacy run before accessing reconstruction evidence', async (t) => {
  const calls = mockDatabase(t, [{ body: [{ ...row, branch: 'shadow/world-thinker' }] }])
  await assert.rejects(processWorldReplayStep('old-run'), /Legacy World replay must be restarted/)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].method, 'GET')
})

test('resuming a legacy failure creates a new run from the original start', async (t) => {
  const fresh = { ...row, cursor_at: since, status: 'queued', weeks_completed: 0, weeks_verified: 0, weeks_projected: 0, weeks_uncovered: 0 }
  const calls = mockDatabase(t, [
    { body: [{ ...row, id: 'old-run', branch: 'shadow/world-thinker' }] },
    { body: [] },
    { body: fresh },
  ])
  const replay = await resumeWorldReplay('old-run')
  assert.equal(replay.id, 'new-run')
  const inserted = calls.find((call) => call.method === 'POST')!.body!
  assert.equal(inserted.cursor_at, since)
  assert.equal(inserted.since_at, since)
  assert.equal(inserted.until_at, until)
  assert.match(String(inserted.branch), /^reconstruction\//)
  assert.equal(inserted.weeks_completed, undefined)
})

test('starting reconstruction retires an active legacy run and preserves its audit history', async (t) => {
  const calls = mockDatabase(t, [
    { body: [{ ...row, id: 'old-run', branch: 'shadow/world-thinker', status: 'paused' }] },
    { body: [] },
    { body: { ...row, cursor_at: since, status: 'queued' } },
  ])
  await startWorldReplay()
  const retired = calls.find((call) => call.method === 'PATCH')!.body!
  assert.equal(retired.status, 'failed')
  assert.match(String(retired.error), /Legacy counters are not reconstruction evidence/)
  assert.equal(retired.weeks_completed, undefined)
  assert.equal(calls.find((call) => call.method === 'POST')!.body!.cursor_at, since)
})

test('reconstruction retry replaces corrupted totals with persisted window counts', async (t) => {
  const observations = [{ id: 'observation-2', world_documents: { canonical_url: 'https://issuer.example/evidence', publisher: 'Official issuer' } }]
  const calls = mockDatabase(t, [
    { body: [row] },
    { body: [{ content: { mode: 'historical_evidence_reconstruction', observations } }] },
    { body: { id: 'batch-2' } },
    { body: [
      { week_start: since, week_end: week2, source_count: 3, status: 'screened' },
      { week_start: week2, week_end: until, source_count: 1, status: 'screened' },
    ] },
    { body: [{ id: 'new-run' }] },
    { body: [{ ...row, status: 'completed', cursor_at: until, weeks_completed: 2, weeks_verified: 2, weeks_projected: 0, sources_scanned: 4 }] },
  ])
  const result = await processWorldReplayStep('new-run', { cursorAt: week2 })
  assert.equal(result.complete, true)
  const updated = calls.find((call) => call.method === 'PATCH')!.body!
  assert.equal(updated.weeks_completed, 2)
  assert.equal(updated.weeks_verified, 2)
  assert.equal(updated.sources_scanned, 4)
  assert.equal(updated.weeks_projected, 0)
  assert.equal(updated.clusters_retained, 0)
  assert.equal(updated.search_gap_weeks, 0)
  const batch = calls.find((call) => call.method === 'POST')!.body!
  assert.deepEqual(batch.source_urls, ['https://issuer.example/evidence'])
  assert.equal(batch.used_deterministic_fallback, false)
})

test('stale continuation cannot advance a newer reconstruction cursor', async (t) => {
  const calls = mockDatabase(t, [{ body: [row] }])
  const result = await processWorldReplayStep('new-run', { cursorAt: since })
  assert.equal(result.superseded, true)
  assert.equal(calls.length, 1)
})

test('reconstruction read errors persist a failed run without advancing its cursor', async (t) => {
  const calls = mockDatabase(t, [
    { body: [row] },
    { body: [] },
    { body: { message: 'Observation read unavailable', code: 'PGRST500' }, status: 500 },
    { body: [] },
  ])
  await assert.rejects(processWorldReplayStep('new-run', { cursorAt: week2 }), /Observation read unavailable/)
  const failed = calls.find((call) => call.method === 'PATCH')!.body!
  assert.equal(failed.status, 'failed')
  assert.equal(failed.error, 'Observation read unavailable')
  assert.equal(failed.cursor_at, undefined)
})
