import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { clinicalCatalystClusterKey, normalizeClinicalCatalyst } from '../lib/markets/biotech.ts'
import { clusterWorldEventSources } from '../lib/server/world-events.ts'
import { routeWorldAttention } from '../lib/markets/world-attention.ts'

const modernaRelease = {
  id: 'feed:moderna',
  feedItemId: '00000000-0000-0000-0000-000000000001',
  title: 'Merck and Moderna Announce Phase 3 INTerpath-001 Trial of Intismeran Autogene Plus KEYTRUDA Met Endpoints of Recurrence-Free Survival and Distant Metastasis-Free Survival in Stage IIB-IV Melanoma',
  url: 'https://news.modernatx.com/phase-3-interpath-001',
  publisher: 'Moderna investor relations',
  publishedAt: '2026-08-19T13:45:00.000Z',
  fetchedAt: '2026-08-19T13:47:00.000Z',
  metadata: { topic: 'company:MRNA' },
}

test('Phase 3 endpoint readouts become urgent, structured clinical catalysts', () => {
  const catalyst = normalizeClinicalCatalyst(modernaRelease)
  assert.ok(catalyst)
  assert.equal(catalyst.kind, 'trial_result')
  assert.equal(catalyst.outcome, 'positive')
  assert.equal(catalyst.significance, 'urgent')
  assert.equal(catalyst.phase, 'Phase 3')
  assert.equal(catalyst.therapy, 'intismeran')
  assert.equal(catalyst.indication, 'melanoma')
  assert.deepEqual(catalyst.symbols, ['MRNA'])
  assert.ok(catalyst.materiality >= 85)
  assert.ok(catalyst.economicChannels.includes('commercial_probability'))
})

test('clinical holds and FDA decisions are decisive while routine earnings are not catalysts', () => {
  const hold = normalizeClinicalCatalyst({ ...modernaRelease, id: 'feed:hold', title: 'FDA places clinical hold on Phase 2 gene therapy trial after serious safety signal' })
  assert.equal(hold?.kind, 'clinical_hold')
  assert.equal(hold?.outcome, 'negative')
  assert.equal(hold?.decisiveNewEvent, true)
  assert.equal(normalizeClinicalCatalyst({ ...modernaRelease, title: 'Moderna reports quarterly revenue and earnings' }), null)
})

test('clinical catalyst identity helps collapse corroborating versions of one readout', () => {
  const first = modernaRelease
  const second = {
    ...modernaRelease,
    id: 'feed:reuters',
    title: 'Positive Phase 3 intismeran results in melanoma met recurrence-free survival primary endpoint',
    url: 'https://reuters.com/business/healthcare/moderna-merck-melanoma',
    publisher: 'Reuters',
    publishedAt: '2026-08-19T14:05:00.000Z',
  }
  assert.equal(clinicalCatalystClusterKey(first.title), clinicalCatalystClusterKey(second.title))
  assert.equal(normalizeClinicalCatalyst(first)?.fingerprint, normalizeClinicalCatalyst(second)?.fingerprint)
  const clusters = clusterWorldEventSources([first, second], new Date('2026-08-19T15:00:00.000Z'))
  assert.equal(clusters.length, 1)
  assert.equal(clusters[0]?.sourceDiversity, 2)
})

test('Phase 3 endpoint success routes urgent to the physical-economy specialist', () => {
  const cluster = clusterWorldEventSources([modernaRelease], new Date('2026-08-19T15:00:00.000Z'))[0]!
  const decision = routeWorldAttention(cluster)
  assert.equal(decision.route, 'urgent')
  assert.equal(decision.specialistLenses[0], 'physical_economy')
})

test('clinical catalyst schema is checked in with bounded dimensions', () => {
  const schema = JSON.parse(readFileSync(new URL('../schemas/clinical-catalyst.schema.json', import.meta.url), 'utf8')) as { properties: Record<string, { minimum?: number; maximum?: number }> }
  assert.deepEqual(schema.properties.materiality, { type: 'integer', minimum: 0, maximum: 100 })
  assert.deepEqual(schema.properties.timeSensitivity, { type: 'integer', minimum: 0, maximum: 100 })
})
