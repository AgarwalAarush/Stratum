import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

import {
  shouldQueueMarketHypothesisResearch,
  validateMarketThesisCritique,
  validateMarketThesisResearch,
} from '../lib/server/market-thesis-research.ts'

const sourceIds = ['source-a', 'source-b', 'source-c']

function researchFixture() {
  return {
    thesisStatement: 'Firm-power constraints could preserve scarcity rents for proven regional supply.',
    whyNow: 'Large-load demand is arriving before every announced capacity project can serve it.',
    causalChain: [
      { from: 'Large-load growth', to: 'Firm-power demand', mechanism: 'data_center_load', evidenceStatus: 'estimate', sourceIds: ['source-a'] },
      { from: 'Firm-power demand', to: 'Regional scarcity', mechanism: 'firm_capacity_constraint', evidenceStatus: 'observed', sourceIds: ['source-b'] },
      { from: 'Regional scarcity', to: 'Economic capture', mechanism: 'economic_capture', evidenceStatus: 'inference', sourceIds: ['source-c'] },
    ],
    demand: { currentState: 'Large loads are growing.', changeMechanism: 'New capacity is requested.', sourceIds: ['source-a'] },
    supply: { currentState: 'Firm supply takes time.', changeMechanism: 'Projects have lead times.', sourceIds: ['source-b'] },
    bottlenecks: [{ name: 'Interconnection', mechanism: 'Queue timing slows supply.', severity: 'important', whoCapturesEconomics: 'Deliverable capacity owners may capture value.', resolutionSignals: ['Queue completions'], sourceIds: ['source-b'] }],
    economics: { valueChain: 'Generation to load serving.', scarcityRentCapture: 'Only proven delivery can capture rents.', beneficiaries: ['Deliverable capacity'], substitutes: ['Flexible load'], sourceIds: ['source-c'] },
    expectations: { currentNarrative: 'Demand growth is well discussed.', whatAppearsPriced: 'Unknown from the supplied evidence.', variantView: 'Regional delivery matters more than aggregate capacity.', sourceIds: ['source-a'] },
    counterThesis: { statement: 'Supply catches up before scarcity persists.', mechanisms: ['Faster projects'], decisiveTests: ['Delivered capacity additions'], sourceIds: ['source-b'] },
    predictions: [
      { prediction: 'Lead times remain visible.', horizon: '12 months', leadingIndicator: 'Queue data', confirmation: 'Projects remain delayed.', disconfirmation: 'Capacity arrives early.', sourceIds: ['source-b'] },
      { prediction: 'Proven capacity signals improve.', horizon: '18 months', leadingIndicator: 'Contract disclosures', confirmation: 'Backlog rises.', disconfirmation: 'Backlog falls.', sourceIds: ['source-c'] },
    ],
    falsifiers: [
      { condition: 'Demand slows.', observable: 'Load forecasts', thesisImpact: 'Weakens scarcity.', sourceIds: ['source-a'] },
      { condition: 'Supply accelerates.', observable: 'Completed projects', thesisImpact: 'Invalidates rent duration.', sourceIds: ['source-b'] },
    ],
    researchFrontier: [{ question: 'Which regions remain constrained?', causalNode: 'regional scarcity', priority: 5, sourceTypes: ['ISO filings'], evidenceNeeded: 'Regional queue and load evidence' }],
    evidenceGaps: ['Security-level valuation is outside this market model.'],
    confidence: 63,
    sourceIds,
  }
}

test('market thesis research requires a source-backed, internally complete ledger', () => {
  const result = validateMarketThesisResearch(researchFixture(), new Set(sourceIds))
  assert.equal(result.causalChain.length, 3)
  assert.equal(result.sourceIds.length, 3)

  const withoutLedger = researchFixture()
  withoutLedger.sourceIds = ['source-a', 'source-b', 'source-d']
  assert.throws(() => validateMarketThesisResearch(withoutLedger, new Set([...sourceIds, 'source-d'])), /omitted referenced source IDs/)

  const unsupportedClaim = researchFixture()
  unsupportedClaim.causalChain[0].sourceIds = []
  assert.throws(() => validateMarketThesisResearch(unsupportedClaim, new Set(sourceIds)), /needs a source ID/)
})

test('critic output is constrained to the same source ledger', () => {
  assert.throws(() => validateMarketThesisCritique({
    verdict: 'needs_revision', summary: 'The causal bridge needs support.', unsupportedClaims: [], contradictoryEvidence: [], missingAlternatives: [], requiredResearch: [], confidenceAdjustment: -10, sourceIds: ['not-in-ledger'],
  }, new Set(sourceIds)), /unknown source IDs/)
})

test('scheduled research does not repeat an unchanged revision frontier', () => {
  assert.equal(shouldQueueMarketHypothesisResearch(null, 0), true)
  assert.equal(shouldQueueMarketHypothesisResearch('complete', 0), false)
  assert.equal(shouldQueueMarketHypothesisResearch('needs_revision', 0), false)
  assert.equal(shouldQueueMarketHypothesisResearch('failed', 0), false)
  assert.equal(shouldQueueMarketHypothesisResearch('needs_revision', 1), true)
})

test('agent jobs use a dedicated bounded research job and deterministic revision trigger', async () => {
  const [jobs, research, actions, schedule] = await Promise.all([
    readFile(new URL('../lib/server/agent-jobs.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/server/market-thesis-research.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/markets/market-theses/[id]/actions/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/server/agent-schedule.ts', import.meta.url), 'utf8'),
  ])
  assert.match(jobs, /'deepen-market-hypothesis'/)
  assert.match(jobs, /findDueMarketHypothesisResearch/)
  assert.match(research, /linked observation/)
  assert.match(actions, /enqueueAgentJob\('deepen-market-hypothesis'/)
  assert.match(schedule, /refresh-market-hypothesis-research/)
})

test('market-thesis promotion requires a completed analyst and critic artifact', async () => {
  const [worldMemory, migration] = await Promise.all([
    readFile(new URL('../lib/server/world-memory.ts', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/202608030003_market_hypothesis_research.sql', import.meta.url), 'utf8'),
  ])
  assert.match(worldMemory, /eq\('status', 'complete'\)/)
  assert.match(worldMemory, /research\.critique\?\.verdict !== 'pass'/)
  assert.match(worldMemory, /research_version_id: research\.id/)
  assert.match(worldMemory, /verification_status: 'needs_company_research'/)
  assert.match(migration, /add column if not exists research_version_id/)
})
