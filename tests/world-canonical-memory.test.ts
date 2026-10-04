import test from 'node:test'
import assert from 'node:assert/strict'
import { retrieveWorldMemory } from '../lib/server/world-retrieval.ts'

test('live canonical recall pins the accepted commit despite late older snapshots; historic cutoffs preserve first-known selection', async t => {
  process.env.SUPABASE_URL = 'https://canonical-memory-test.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role'
  const prior = process.env.STRATUM_WORLD_CUTOVER_ENABLED
  process.env.STRATUM_WORLD_CUTOVER_ENABLED = 'true'
  t.after(() => { if (prior === undefined) delete process.env.STRATUM_WORLD_CUTOVER_ENABLED; else process.env.STRATUM_WORLD_CUTOVER_ENABLED = prior })
  const queries: URL[] = []
  let ready = true
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL) => {
    const url = new URL(String(input)); queries.push(url)
    let response: unknown = []
    if (url.pathname.endsWith('/world_repository_projections')) response = { commit_sha: 'current-C' }
    if (url.pathname.endsWith('/world_memory_snapshots')) {
      // Older B was first published later; sorting by accepted_at alone would
      // incorrectly replace the current canonical model on live queries.
      response = url.searchParams.get('commit_sha') === 'eq.current-C'
        ? ready ? { commit_sha: 'current-C', accepted_at: '2026-10-03T10:00:00Z', sources: [] } : null
        : { commit_sha: 'historical-B', accepted_at: '2026-10-02T10:00:00Z', sources: [] }
    }
    return new Response(JSON.stringify(response), { headers: { 'Content-Type': 'application/json' } })
  })
  const live = await retrieveWorldMemory({ query: 'grid' }, { now: '2026-10-03T12:00:00Z' })
  assert.equal(live.receipt.commit, 'current-C')
  const projectionQuery = queries.find(q => q.pathname.endsWith('/world_repository_projections'))!
  assert.equal(projectionQuery.searchParams.get('canonical_promoted_at'), 'lte.2026-10-03T12:00:00.000Z')
  assert.equal(projectionQuery.searchParams.has('projected_at'), false)
  assert.equal(queries.find(q => q.pathname.endsWith('/world_memory_snapshots'))?.searchParams.get('commit_sha'), 'eq.current-C')
  ready = false
  queries.length = 0
  const missing = await retrieveWorldMemory({ query: 'grid' }, { now: '2026-10-03T12:00:00Z' })
  assert.equal(missing.receipt.commit, null)
  assert.deepEqual(missing.bundles, [])
  assert.match(missing.abstention!, /canonical World memory snapshot is not ready/)
  queries.length = 0
  const historic = await retrieveWorldMemory({ query: 'grid', knowledgeCutoff: '2026-10-02T12:00:00Z' }, { now: '2026-10-03T12:00:00Z' })
  assert.equal(historic.receipt.commit, 'historical-B')
  assert.equal(queries.some(q => q.pathname.endsWith('/world_repository_projections')), false)
  assert.equal(queries.find(q => q.pathname.endsWith('/world_memory_snapshots'))?.searchParams.get('commit_sha'), null)
  assert.equal(historic.receipt.knowledgeCutoff, '2026-10-02T12:00:00.000Z')
})
