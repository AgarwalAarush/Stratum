import test from 'node:test'
import assert from 'node:assert/strict'
import type { WorldSourceContract, WorldSourceRegistryEntry } from '../lib/markets/types.ts'
import { fetchGovernedSourceDocument, isSourceCollectionDue, shouldCollectGovernedSource } from '../lib/server/world-source-collector.ts'

const source = {
  id: 'source-id', slug: 'official-source', label: 'Official source', publisher: 'Official publisher', canonicalUrl: 'https://official.example/data',
  sourceTier: 'regulatory', sourceKind: 'html', status: 'approved', evidenceClasses: ['regulatory_data'], discoveredBy: 'seed', discoveryRunId: null,
  approvedAt: '2026-08-01T00:00:00.000Z', blockedReason: null, domainIds: ['ai-power'], health: null, createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z',
} satisfies WorldSourceRegistryEntry

const contract = {
  id: 'contract-id', sourceId: 'source-id', version: 1, status: 'active', allowedHosts: ['official.example'], allowedPaths: ['/data'],
  acceptedMimeTypes: ['text/html'], cadence: 'daily', assertionsAllowed: ['fact'], retentionDays: 365, notes: 'Bounded official page.', createdAt: '2026-08-01T00:00:00.000Z',
} satisfies WorldSourceContract

test('collector follows only redirects permitted by the active source contract', async () => {
  const calls: string[] = []
  const fetched = await fetchGovernedSourceDocument({ source, contract }, {
    fetchImpl: async (input) => {
      calls.push(String(input))
      if (String(input).endsWith('/data')) return new Response(null, { status: 302, headers: { location: '/data/release' } })
      return new Response('<html><title>Release</title><main>Official content</main></html>', { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } })
    },
  })
  assert.deepEqual(calls, ['https://official.example/data', 'https://official.example/data/release'])
  assert.equal(fetched.resolvedUrl, 'https://official.example/data/release')
  assert.equal(fetched.mimeType, 'text/html')
  assert.match(fetched.body.toString('utf8'), /Official content/)
})

test('collector rejects an off-contract redirect before it is fetched', async () => {
  const calls: string[] = []
  await assert.rejects(
    fetchGovernedSourceDocument({ source, contract }, {
      fetchImpl: async (input) => {
        calls.push(String(input))
        return new Response(null, { status: 302, headers: { location: 'https://outside.example/payload' } })
      },
    }),
    /outside the active source contract/,
  )
  assert.deepEqual(calls, ['https://official.example/data'])
})

test('collector rejects MIME types outside the source contract and leaves event sources manual', async () => {
  await assert.rejects(
    fetchGovernedSourceDocument({ source, contract }, {
      fetchImpl: async () => new Response('{"value":1}', { status: 200, headers: { 'content-type': 'application/json' } }),
    }),
    /outside the active source contract/,
  )
  assert.equal(isSourceCollectionDue('daily', new Date('2026-08-03T00:00:00Z')), true)
  assert.equal(isSourceCollectionDue('weekly', new Date('2026-08-02T00:00:00Z')), true)
  assert.equal(isSourceCollectionDue('monthly', new Date('2026-08-01T00:00:00Z')), true)
  assert.equal(isSourceCollectionDue('event', new Date('2026-08-02T00:00:00Z')), false)
})

test('a newly admitted source gets one governed capture before its normal refresh cadence', () => {
  const monday = new Date('2026-08-03T00:00:00Z')
  assert.equal(shouldCollectGovernedSource('weekly', false, monday), true)
  assert.equal(shouldCollectGovernedSource('weekly', true, monday), false)
  assert.equal(shouldCollectGovernedSource('weekly', true, new Date('2026-08-02T00:00:00Z')), true)
  assert.equal(shouldCollectGovernedSource('event', false, monday), false)
})
