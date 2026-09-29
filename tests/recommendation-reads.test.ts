import test from 'node:test'
import assert from 'node:assert/strict'
import { fetchRecommendationActions, fetchRecommendationEvidence, fetchRecommendationLearning } from '../lib/server/recommendation-reads.ts'

test('recommendation views isolate owner reads and defer expensive optional data', async context => {
  process.env.SUPABASE_URL = 'https://recommendation-test.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-key'
  const requests: URL[] = []
  let missingBatch = false
  let failManifest = false
  const fixtures: Record<string, unknown> = {
    portfolios: [{ id: 'portfolio', name: 'Personal', kind: 'manual' }],
    recommendation_batches: { id: 'batch', manifest_id: 'manifest', published_at: '2026-09-22T16:39:00Z', decision_date: '2026-09-22', summary: 'Recorded edition' },
    recommendation_versions: [{ id: 'decision', content: { symbol: 'EXAMPLE', portfolioId: 'portfolio' } }],
    recommendation_owner_events: [],
  }
  context.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL) => {
    const url = new URL(String(input))
    requests.push(url)
    const table = url.pathname.split('/').pop()!
    if (table === 'recommendation_input_manifests') {
      if (failManifest) return new Response(JSON.stringify({ message: 'Unavailable' }), { status: 400 })
      const data = url.searchParams.get('select')?.startsWith('evidence:')
        ? { evidence: [{ id: 'source', url: 'https://example.com', asOf: '2026-09-21', availableAt: '2026-09-22', value: { raw: 'large private evidence' } }] }
        : { cutoff: '2026-09-22', policy: 'policy', gaps: ['Missing price'] }
      return Response.json(data)
    }
    if (table === 'recommendation_batches' && missingBatch) return Response.json(null)
    if (!(table in fixtures)) return new Response(JSON.stringify({ message: 'Learning store unavailable' }), { status: 400 })
    return Response.json(fixtures[table])
  })

  await context.test('Actions needs four narrow queries even when learning is unavailable', async () => {
    const data = await fetchRecommendationActions('owner-one')
    assert.equal(data.recommendations.length, 1)
    assert.equal(data.context?.gaps[0], 'Missing price')
    assert.equal(requests.length, 4)
    assert.ok(requests.every(url => url.searchParams.get('owner_id') === 'eq.owner-one'))
    assert.equal(requests.find(url => url.pathname.endsWith('recommendation_batches'))?.searchParams.get('limit'), '1')
    assert.ok(requests.every(url => !url.searchParams.get('select')?.includes('*')))
    assert.ok(!requests.some(url => /evaluations|forecasts|outbox|experiments/.test(url.pathname)))
    assert.ok(!JSON.stringify(data).includes('private evidence'))
    assert.ok(Number.isFinite(Date.parse(data.viewedAt)))
  })
  await context.test('An unpublished account stops after accounts and batch lookup', async () => {
    requests.length = 0
    missingBatch = true
    const data = await fetchRecommendationActions('owner-two')
    assert.equal(data.latest, null)
    assert.deepEqual(data.recommendations, [])
    assert.equal(requests.length, 2)
    assert.ok(requests.every(url => url.searchParams.get('owner_id') === 'eq.owner-two'))
    missingBatch = false
  })
  await context.test('Missing required evidence fails instead of presenting an empty safe assessment', async () => {
    failManifest = true
    await assert.rejects(fetchRecommendationActions('owner-one'), /assessment evidence/)
    failManifest = false
  })
  await context.test('Expanded evidence preserves source dates without browser raw payloads', async () => {
    requests.length = 0
    const data = await fetchRecommendationEvidence('owner-one', 'batch')
    assert.deepEqual(data.evidence, [{ id: 'source', url: 'https://example.com', asOf: '2026-09-21', availableAt: '2026-09-22' }])
    assert.ok(requests.every(url => url.searchParams.get('owner_id') === 'eq.owner-one'))
    assert.equal(requests.find(url => url.pathname.endsWith('recommendation_owner_events'))?.searchParams.get('recommendation_versions.batch_id'), 'eq.batch')
  })
  await context.test('Track-record failure is explicit and independent', async () => {
    await assert.rejects(fetchRecommendationLearning('owner-one'), /Track record is temporarily unavailable/)
  })
  await context.test('Immutable sources reuse the bounded cache while events stay fresh and owners remain isolated', async () => {
    requests.length = 0
    await fetchRecommendationEvidence('owner-one', 'batch')
    assert.equal(requests.length, 2)
    assert.ok(requests.some(url => url.pathname.endsWith('recommendation_owner_events')))
    assert.ok(!requests.some(url => url.pathname.endsWith('recommendation_input_manifests')))
    requests.length = 0
    await fetchRecommendationEvidence('owner-two', 'batch')
    assert.equal(requests.length, 3)
    assert.ok(requests.every(url => url.searchParams.get('owner_id') === 'eq.owner-two'))
  })
})
