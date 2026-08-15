import assert from 'node:assert/strict'
import test from 'node:test'
import { selectControlledExposureResearch } from '../lib/markets/market-exposure-research.ts'
import type { MarketThesisExposure } from '../lib/markets/types.ts'

function exposure(overrides: Partial<MarketThesisExposure> = {}): MarketThesisExposure {
  return {
    id: 'exposure', valueChainLayer: 'processing', entityName: 'Acme Materials', symbol: 'ACME', role: 'beneficiary',
    mechanism: 'Named capacity may capture economics.', materiality: 80, confidence: 70, verificationStatus: 'needs_company_research',
    resolutionMethod: 'analyst_source_candidate', resolutionReason: 'Named in source ledger.', sourceIds: ['source-id'], researchJobId: null, researchQueuedAt: null,
    ...overrides,
  }
}

test('controlled exposure queue admits only high-materiality source-attributed public-company candidates', () => {
  const selected = selectControlledExposureResearch([
    exposure({ id: 'high', symbol: 'HIGH', materiality: 90 }),
    exposure({ id: 'low', symbol: 'LOW', materiality: 69 }),
    exposure({ id: 'generic', symbol: null, resolutionMethod: null }),
    exposure({ id: 'queued', symbol: 'DONE', researchQueuedAt: '2026-08-15T00:00:00Z' }),
  ])
  assert.deepEqual(selected.map((item) => item.symbol), ['HIGH'])
})

test('controlled exposure queue is capped and prioritizes materiality then confidence', () => {
  const selected = selectControlledExposureResearch([
    exposure({ id: 'one', symbol: 'ONE', materiality: 85, confidence: 62 }),
    exposure({ id: 'two', symbol: 'TWO', materiality: 92, confidence: 61 }),
    exposure({ id: 'three', symbol: 'THREE', materiality: 85, confidence: 75 }),
  ], { limit: 2 })
  assert.deepEqual(selected.map((item) => item.symbol), ['TWO', 'THREE'])
})
