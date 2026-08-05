import assert from 'node:assert/strict'
import test from 'node:test'
import { scheduledMarketResearchRunLimit, selectMarketModel, workerJobConcurrency } from '../lib/server/market-model-policy.ts'

test('market model policy reserves cheap models for non-authoritative routing', () => {
  const environment = {
    STRATUM_SOURCE_SCOUT_MODEL: 'cheap-model',
    STRATUM_MARKET_STANDARD_MODEL: 'standard-model',
    STRATUM_MARKET_RESEARCH_MODEL: 'strong-model',
  } as NodeJS.ProcessEnv
  assert.deepEqual(selectMarketModel('source_scout', environment), {
    task: 'source_scout', tier: 'cheap', model: 'cheap-model',
    rationale: 'Non-authoritative source or observation routing; outputs require deterministic validation and source approval.',
  })
  assert.equal(selectMarketModel('research_planning', environment).tier, 'standard')
  assert.equal(selectMarketModel('prediction_evaluation', environment).model, 'standard-model')
  assert.equal(selectMarketModel('hypothesis_analysis', environment).tier, 'strong')
  assert.equal(selectMarketModel('hypothesis_critic', environment).model, 'strong-model')
})

test('scheduled strong research has a central bounded run cap', () => {
  assert.equal(scheduledMarketResearchRunLimit({ STRATUM_MARKET_RESEARCH_RUN_LIMIT: '3' }), 3)
  assert.equal(scheduledMarketResearchRunLimit({ STRATUM_MARKET_RESEARCH_RUN_LIMIT: '0' }), 2)
  assert.equal(scheduledMarketResearchRunLimit({ STRATUM_MARKET_RESEARCH_RUN_LIMIT: '99' }), 2)
  assert.equal(scheduledMarketResearchRunLimit({}), 2)
})

test('worker concurrency is capped for efficient parallel drains', () => {
  assert.equal(workerJobConcurrency({ STRATUM_WORKER_CONCURRENCY: '3' }), 3)
  assert.equal(workerJobConcurrency({ STRATUM_WORKER_CONCURRENCY: '0' }), 2)
  assert.equal(workerJobConcurrency({ STRATUM_WORKER_CONCURRENCY: '9' }), 2)
  assert.equal(workerJobConcurrency({}), 2)
})
