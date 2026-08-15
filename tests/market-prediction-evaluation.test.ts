import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import {
  predictionDeadlineFromHorizon,
  shouldResolvePredictionDeadlineWithoutModel,
  validateMarketPredictionEvaluation,
} from '../lib/server/market-prediction-evaluation.ts'

test('prediction horizons become bounded deterministic deadlines', () => {
  const start = new Date('2026-08-04T00:00:00.000Z')
  assert.equal(predictionDeadlineFromHorizon('12 months', start), '2027-08-04T06:00:00.000Z')
  assert.equal(predictionDeadlineFromHorizon('2 quarters', start), '2027-02-02T15:00:00.000Z')
  assert.equal(predictionDeadlineFromHorizon('within three months', start), '2026-11-03T07:30:00.000Z')
  assert.equal(predictionDeadlineFromHorizon('6-12 months', start), '2027-08-04T06:00:00.000Z')
  assert.equal(predictionDeadlineFromHorizon('eventually', start), null)
  assert.equal(predictionDeadlineFromHorizon('50 years', start), null)
})

test('an elapsed deadline without new governed evidence expires deterministically', () => {
  const now = Date.parse('2026-08-04T00:00:00.000Z')
  assert.equal(shouldResolvePredictionDeadlineWithoutModel('2026-08-03T23:59:59.000Z', 0, now), true)
  assert.equal(shouldResolvePredictionDeadlineWithoutModel('2026-08-03T23:59:59.000Z', 1, now), false)
  assert.equal(shouldResolvePredictionDeadlineWithoutModel('2026-08-05T00:00:00.000Z', 0, now), false)
  assert.equal(shouldResolvePredictionDeadlineWithoutModel(null, 0, now), false)
})

test('prediction evaluations cannot turn unsupported evidence into a verdict', () => {
  const sourceIds = new Set(['source-a', 'source-b'])
  assert.deepEqual(validateMarketPredictionEvaluation({
    verdict: 'confirmed', rationale: 'The stated indicator moved in the prediction direction with direct source support.', sourceIds: ['source-a'],
  }, sourceIds), {
    verdict: 'confirmed', rationale: 'The stated indicator moved in the prediction direction with direct source support.', sourceIds: ['source-a'],
  })
  assert.throws(() => validateMarketPredictionEvaluation({ verdict: 'disconfirmed', rationale: 'A conclusion without cited evidence is invalid for this durable artifact.', sourceIds: [] }, sourceIds), /needs source evidence/)
  assert.throws(() => validateMarketPredictionEvaluation({ verdict: 'confirmed', rationale: 'The supplied material is sufficient to decide the prediction outcome.', sourceIds: ['outside-ledger'] }, sourceIds), /unknown source IDs/)
  assert.deepEqual(validateMarketPredictionEvaluation({ verdict: 'inconclusive', rationale: 'The supplied evidence is mixed and does not meet either stated test.', sourceIds: [] }, sourceIds).verdict, 'inconclusive')
})

test('prediction evaluations are versioned and disconfirmation only queues research revision', async () => {
  const [migration, evaluator, jobs, schedule, workspace, presentation] = await Promise.all([
    readFile(new URL('../supabase/migrations/202608040002_market_prediction_evaluations.sql', import.meta.url), 'utf8'),
    readFile(new URL('../lib/server/market-prediction-evaluation.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/server/agent-jobs.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/server/agent-schedule.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/server/world-memory.ts', import.meta.url), 'utf8'),
    readFile(new URL('../components/markets/MarketThesisWorkspace.tsx', import.meta.url), 'utf8'),
  ])
  assert.match(migration, /market_thesis_prediction_evaluations/i)
  assert.match(migration, /unique \(prediction_id, version\)/i)
  assert.match(evaluator, /A scheduler tick by itself cannot/i)
  assert.match(evaluator, /without any new linked governed observation/i)
  assert.match(evaluator, /shouldResolvePredictionDeadlineWithoutModel/)
  assert.match(jobs, /'evaluate-market-prediction'/)
  assert.match(jobs, /prediction disconfirmed/)
  assert.match(jobs, /'deepen-market-hypothesis'/)
  assert.match(schedule, /'orchestrate-market-research'/)
  assert.match(await readFile(new URL('../lib/server/market-research-orchestrator.ts', import.meta.url), 'utf8'), /evaluate_prediction/)
  assert.match(workspace, /market_thesis_prediction_evaluations/)
  assert.match(workspace, /latestEvaluation/)
  assert.match(presentation, /Awaiting a due date or new linked evidence before evaluation/)
})
