import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import type { MarketHypothesis } from '../lib/markets/types.ts'
import { storeWorldCorpusDocument } from '../lib/server/world-corpus.ts'
import { marketHypothesisPromotionEligible, minimumMechanismsForDomainHypothesis, shouldAutoPromoteMarketResearch } from '../lib/server/world-memory.ts'

function hypothesis(): MarketHypothesis {
  return {
    id: 'hypothesis', ownerId: 'owner', title: 'Power scarcity', status: 'proposed', scope: 'ai-power', horizon: '1-5 years',
    coreMechanism: 'Demand meets constraints', confidence: 76, unresolvedNodes: ['equipment_lead_time'], counterThesis: 'Supply catches up',
    parentHypothesisId: null, createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z', evidence: [],
    causalGraph: [
      { from: 'A', to: 'B', mechanism: 'data_center_load', core: true },
      { from: 'B', to: 'C', mechanism: 'firm_capacity_constraint', core: true },
      { from: 'C', to: 'D', mechanism: 'interconnection_constraint', core: true },
      { from: 'D', to: 'E', mechanism: 'economic_capture', core: true },
    ],
  }
}

test('content-addressed corpus archives identical source bytes once while retaining extracted text', async () => {
  const root = await mkdtemp(join(tmpdir(), 'stratum-world-corpus-'))
  try {
    const environment = { ...process.env, STRATUM_DATA_ROOT: root, STRATUM_CORPUS_TEST_MODE: 'true' }
    const input = {
      title: 'Official source', canonicalUrl: 'https://example.com/source', publisher: 'Example', domain: 'ai-power', body: 'durable raw source', publishedAt: '2026-08-01T00:00:00.000Z',
    }
    const first = await storeWorldCorpusDocument(input, environment)
    const second = await storeWorldCorpusDocument({ ...input, title: 'A changed display title' }, environment)
    assert.equal(first.contentHash, second.contentHash)
    assert.equal(first.archiveKey, second.archiveKey)
    const extracted = await readFile(join(root, first.extractedKey), 'utf8')
    assert.match(extracted, /durable raw source/)
    assert.match(extracted, /Official source/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('world-memory ingestion treats duplicate document and observation fingerprints as immutable records', async () => {
  const source = await readFile(new URL('../lib/server/world-memory.ts', import.meta.url), 'utf8')
  assert.match(source, /onConflict: 'content_hash', ignoreDuplicates: true/)
  assert.match(source, /onConflict: 'fingerprint', ignoreDuplicates: true/)
  assert.match(source, /select\('\*'\)\.eq\('content_hash', stored\.contentHash\)/)
  assert.match(source, /select\('\*'\)\.eq\('fingerprint', fingerprint\)/)
})

test('database enforces append-only immutable evidence and review records', async () => {
  const migration = await readFile(new URL('../supabase/migrations/202608040015_immutable_world_evidence.sql', import.meta.url), 'utf8')
  for (const table of [
    'world_documents', 'world_observations', 'world_source_document_captures',
    'world_observation_proposals', 'world_observation_proposal_reviews', 'world_observation_proposal_triage_runs',
  ]) {
    assert.match(migration, new RegExp(`before update or delete on public\\.${table}`))
  }
  assert.match(migration, /create a new provenance-linked artifact instead/)
})

test('balanced automatic promotion accepts one non-core gap but blocks missing official or independent evidence', () => {
  const now = new Date('2026-08-03T00:00:00.000Z')
  const official = ['data_center_load', 'firm_capacity_constraint', 'interconnection_constraint'].map((causalNode) => ({
    causalNode, sourceTier: 'regulatory' as const, observedAt: '2026-08-01T00:00:00.000Z',
  }))
  assert.equal(marketHypothesisPromotionEligible(hypothesis(), [...official, {
    causalNode: 'equipment_lead_time', sourceTier: 'independent', observedAt: '2026-08-02T00:00:00.000Z',
  }], now), true)
  assert.equal(marketHypothesisPromotionEligible(hypothesis(), [...official, {
    causalNode: 'equipment_lead_time', sourceTier: 'primary', observedAt: '2026-08-02T00:00:00.000Z',
  }], now), true)
  assert.equal(marketHypothesisPromotionEligible(hypothesis(), official, now), false)
  assert.equal(marketHypothesisPromotionEligible(hypothesis(), [
    ...official.filter((item) => item.causalNode !== 'interconnection_constraint'),
    { causalNode: 'equipment_lead_time', sourceTier: 'independent', observedAt: '2026-08-02T00:00:00.000Z' },
  ], now), false)
  // Recently ingested annual reports remain eligible even when publication dates
  // sit near the edge of the freshness window.
  assert.equal(marketHypothesisPromotionEligible(hypothesis(), [
    ...official.map((item) => ({ ...item, observedAt: '2026-03-01T00:00:00.000Z' })),
    { causalNode: 'equipment_lead_time', sourceTier: 'independent', observedAt: '2026-02-24T00:00:00.000Z' },
  ], now), true)
})

test('completed research needs an explicit auto-promotion switch before a worker may publish a thesis', () => {
  assert.equal(shouldAutoPromoteMarketResearch('complete', {}), false)
  assert.equal(shouldAutoPromoteMarketResearch('needs_revision', { MARKET_AUTO_THESIS_ENABLED: 'true' }), false)
  assert.equal(shouldAutoPromoteMarketResearch('complete', { MARKET_AUTO_THESIS_ENABLED: 'true' }), true)
})

test('promoted thesis confidence comes from validated research, not correlation score', async () => {
  const source = await readFile(new URL('../lib/server/world-memory.ts', import.meta.url), 'utf8')
  assert.match(source, /publishedConfidence = Math\.round\(researchContent\.confidence\)/)
  assert.match(source, /confidence: publishedConfidence/)
  assert.match(source, /!\/\^\(none\|no beneficiary\)\\b\/i/)
})

test('all market domain packs use the same bounded correlation threshold', () => {
  assert.equal(minimumMechanismsForDomainHypothesis('ai-power'), 3)
  assert.equal(minimumMechanismsForDomainHypothesis('semicap-data-center-equipment'), 3)
  assert.equal(minimumMechanismsForDomainHypothesis('critical-materials'), 3)
  assert.throws(() => minimumMechanismsForDomainHypothesis('unknown-domain'), /Unknown market domain/)
})
