import test from 'node:test'
import assert from 'node:assert/strict'
import { retrieveWorldMemory, worldResearchPreparation } from '../lib/server/world-retrieval.ts'

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
  assert.equal(queries.find(q => q.pathname.endsWith('/world_memory_snapshots'))?.searchParams.get('select'), 'commit_sha,accepted_at')
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

test('narrow snapshot reads preserve claim and historical counterevidence source ledgers', async t => {
  process.env.SUPABASE_URL = 'https://canonical-memory-test.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role'
  const prior = process.env.STRATUM_WORLD_CUTOVER_ENABLED
  process.env.STRATUM_WORLD_CUTOVER_ENABLED = 'true'
  t.after(() => { if (prior === undefined) delete process.env.STRATUM_WORLD_CUTOVER_ENABLED; else process.env.STRATUM_WORLD_CUTOVER_ENABLED = prior })
  const source = { id: 'capacity-document', url: 'https://agency.example/capacity', title: 'Grid capacity', publisher: 'Agency',
    publishedAt: '2026-09-28T00:00:00Z', capturedAt: '2026-10-01T00:00:00Z', ingestedAt: '2026-10-01T01:00:00Z',
    evidenceOrigin: 'https://agency.example/capacity', documentId: 'document-capacity', claimState: 'reported', stance: 'supporting' }
  const counterSource = { ...source, id: 'expansion-document', url: 'https://agency.example/expansion', title: 'Grid expansion',
    evidenceOrigin: 'https://agency.example/expansion', documentId: 'document-expansion', stance: 'contradicting' }
  const claim = { claimId: 'capacity-claim', text: 'Grid capacity constrains power connections', sourceIds: [source.id],
    kind: 'observed_fact', contradicts: ['expansion-claim'], evidence: [{ sourceId: source.id, quote: 'Connections remain constrained.' }], observationIds: ['capacity-observation'] }
  const node = { id: 'grid', title: 'Grid capacity', kind: 'theme', status: 'active', asOf: '2026-10-03T00:00:00Z',
    confidence: 70, importance: 80, aliases: ['power'], relationships: [], sourceIds: [source.id],
    nextReviewAt: '2026-11-01T00:00:00Z', summary: 'Capacity constraint', body: 'Capacity constraint', claims: [claim], indicators: [] }
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL) => {
    const url = new URL(String(input))
    let response: unknown = []
    if (url.pathname.endsWith('/world_repository_projections')) response = { commit_sha: 'current-C' }
    if (url.pathname.endsWith('/world_memory_snapshots')) {
      assert.equal(url.searchParams.get('select'), 'commit_sha,accepted_at', 'The unused wide snapshot ledger must not be requested')
      response = { commit_sha: 'current-C', accepted_at: '2026-10-03T10:00:00Z' }
    }
    if (url.pathname.endsWith('/world_file_index')) response = [{ structured_content: node }]
    if (url.pathname.endsWith('/world_claim_memberships')) response = [{ node_id: node.id, world_claim_revisions: {
      revision_id: 'capacity-revision', claim_id: claim.claimId, node_id: node.id, content: claim,
      accepted_at: '2026-10-03T10:00:00Z', sources: [source], evidence_origins: [source.evidenceOrigin],
    } }]
    if (url.pathname.endsWith('/world_claim_revisions')) response = [{
      revision_id: 'expansion-revision', claim_id: 'expansion-claim', node_id: node.id,
      content: { claimId: 'expansion-claim', text: 'Earlier transmission expansion reduced constraints', sourceIds: [counterSource.id], kind: 'observed_fact' },
      accepted_at: '2026-10-01T10:00:00Z', sources: [counterSource], evidence_origins: [counterSource.evidenceOrigin],
    }]
    return new Response(JSON.stringify(response), { headers: { 'Content-Type': 'application/json' } })
  })
  const recall = await retrieveWorldMemory({ query: 'grid power' }, { now: '2026-10-03T12:00:00Z' })
  assert.equal(recall.bundles.length, 1)
  assert.deepEqual(recall.bundles[0].sources, [source])
  assert.deepEqual(recall.bundles[0].claim.evidence, claim.evidence)
  assert.equal(recall.bundles[0].evidenceStatus, 'captured')
  assert.equal(recall.bundles[0].independentEvidenceCount, 1)
  assert.equal(recall.bundles[0].counterevidence[0].historical, true)
  assert.deepEqual(recall.bundles[0].counterevidence[0].sources, [counterSource])
  assert.deepEqual(worldResearchPreparation(recall).documentUrls, [source.url, counterSource.url])
  assert.deepEqual(recall.receipt.claimIds, ['capacity-claim'])
})
