import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyShadowPolicy,
  evaluateShadowCalibration,
  type ShadowForecastPair,
} from '../lib/markets/shadow-policy.ts'
import type { Recommendation } from '../lib/markets/recommendations.ts'

test('executable alternatives change only economic probabilities and preserve the original', () => {
  const original = {
    action: 'buy',
    thesis: 'Original thesis',
    entry: { maxPrice: 100 },
    forecasts: [{ probability: 0.9 }, { probability: 0.1 }],
  } as Recommendation
  const result = applyShadowPolicy('forecast-shrink-20-v1', [original])[0]
  assert.equal(result.forecasts[0].probability, 0.8200000000000001)
  assert.equal(result.forecasts[1].probability, 0.17999999999999994)
  assert.equal(original.forecasts[0].probability, 0.9)
  assert.equal(result.action, original.action)
  assert.deepEqual(result.entry, original.entry)
  assert.throws(
    () => applyShadowPolicy('invented', [original]),
    /implemented/,
  )
})
const pair: ShadowForecastPair = {
  question: 'security:revenue:2026Q4',
  securityId: 'security',
  issuedAt: '2026-09-01',
  deadline: '2026-12-31',
  baselineProbability: 0.9,
  candidateProbability: 0.82,
  outcome: false,
  evaluationId: 'evidence-1',
}
test('calibration retains unresolved claims and removes portfolio duplicates and overlap', () => {
  const r = evaluateShadowCalibration(
    [
      pair,
      { ...pair, issuedAt: '2026-09-02' },
      { ...pair, question: 'overlap', issuedAt: '2026-10-01' },
      {
        ...pair,
        question: 'independent',
        issuedAt: '2027-02-01',
        deadline: '2027-03-01',
        outcome: null,
      },
    ],
    20,
  )
  assert.equal(r.resolvedEpisodes, 1)
  assert.equal(r.unresolvedEpisodes, 1)
  assert.equal(r.repeated, 1)
  assert.equal(r.overlapping, 1)
  assert.ok(r.improvement! > 0)
  assert.equal(r.baselineBrier, 0.81)
  assert.equal(
    evaluateShadowCalibration([{ ...pair, outcome: null }], 20).improvement,
    null,
  )
})
