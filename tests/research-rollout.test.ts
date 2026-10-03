import assert from 'node:assert/strict'
import test from 'node:test'
import { planPortfolioResearchBackfill, researchActiveJobLimit, type PortfolioResearchHolding, type ResearchRolloutReport } from '../lib/markets/research-rollout.ts'
import { CURRENT_RESEARCH_CONTRACT_VERSION } from '../lib/markets/research-contract.ts'
import { currentResearchContract } from './fixtures/current-research-contract.ts'

const now = new Date('2026-10-03T00:00:00Z')
const ownerId = '00000000-0000-4000-8000-000000000001'
const holding = (symbol: string, instrumentType: 'equity' | 'etf' = 'equity'): PortfolioResearchHolding => ({ ownerId, symbol, instrumentType, researchSupported: true })
const report = (symbol: string, instrumentType: 'equity' | 'etf' = 'equity'): ResearchRolloutReport => ({
  id: `note:${symbol}`, ownerId, symbol, instrumentType, status: 'complete', generatedAt: now.toISOString(), dataAsOf: now.toISOString(),
  content: currentResearchContract(),
})

test('portfolio backfill upgrades complete legacy equity and ETF reports', () => {
  const plan = planPortfolioResearchBackfill({ now, holdings: [holding('TSLA'), holding('GRID', 'etf'), holding('LITE')],
    reports: [{ ...report('TSLA'), content: {} }, { ...report('GRID', 'etf'), content: {} }], jobs: [] })
  assert.equal(plan.completed.length, 0)
  assert.deepEqual(plan.pending.map(target => [target.symbol, target.instrumentType, target.reason]), [
    ['LITE', 'equity', 'missing_research'], ['GRID', 'etf', 'contract_upgrade'], ['TSLA', 'equity', 'contract_upgrade'],
  ])
})

test('a contract label alone is not an upgraded report', () => {
  const invalid = { ...report('TSLA'), content: { researchContractVersion: CURRENT_RESEARCH_CONTRACT_VERSION } }
  const plan = planPortfolioResearchBackfill({ now, holdings: [holding('TSLA'), holding('GRID', 'etf')], reports: [invalid, report('GRID', 'etf')], jobs: [] })
  assert.deepEqual(plan.completed.map(target => target.symbol), ['GRID'])
  assert.equal(plan.pending[0].reason, 'contract_upgrade')
})

test('bounded capacity counts other owners and retains every deferred holding', () => {
  const jobs = Array.from({ length: 4 }, (_, n) => ({ id: String(n), ownerId: 'other', symbol: `OTHER${n}`, status: 'running', createdAt: now.toISOString() }))
  const plan = planPortfolioResearchBackfill({ now, holdings: [holding('TSLA'), holding('GRID', 'etf')], reports: [], jobs })
  assert.equal(plan.capacity, 0)
  assert.equal(plan.selected.length, 0)
  assert.equal(plan.pending.length, 2)
})

test('active research and unsupported holdings stay visible and are not duplicated', () => {
  const plan = planPortfolioResearchBackfill({ now, holdings: [holding('TSLA'), holding('TSLA'), { ...holding('ETF', 'etf'), researchSupported: false, unavailableReason: 'Issuer adapter missing' }], reports: [],
    jobs: [{ id: 'active', ownerId, symbol: 'TSLA', status: 'queued', createdAt: now.toISOString() }] })
  assert.equal(plan.inProgress.length, 1)
  assert.equal(plan.inProgress[0].jobId, 'active')
  assert.equal(plan.unavailable.length, 1)
  assert.equal(plan.pending.length, 0)
})

test('stale, invalid-dated and failed research cannot be counted as completed', () => {
  const plan = planPortfolioResearchBackfill({ now, holdings: [holding('OLD'), holding('FAIL'), holding('INVALID')], jobs: [], reports: [
    { ...report('OLD'), generatedAt: '2026-08-01T00:00:00Z' }, { ...report('FAIL'), status: 'failed' }, { ...report('INVALID'), generatedAt: 'invalid' },
  ], batchSize: 1 })
  assert.equal(plan.completed.length, 0)
  assert.equal(plan.pending.length, 3)
  assert.equal(plan.selected.length, 1)
  assert.equal(plan.selected[0].reason, 'failed_research')
})

test('research pending limit accepts only bounded configured values', () => {
  assert.equal(researchActiveJobLimit({ RESEARCH_ACTIVE_JOB_LIMIT: '2' }), 2)
  for (const value of ['0', '8', 'NaN', '1.5']) assert.equal(researchActiveJobLimit({ RESEARCH_ACTIVE_JOB_LIMIT: value }), 4)
})

test('an exhausted pre-report retry remains visible and cannot starve later holdings', () => {
  const baseline = planPortfolioResearchBackfill({ now, holdings: [holding('FAIL'), holding('LITE')], reports: [], jobs: [], activeLimit: 1 })
  const failed = baseline.pending.find(target => target.symbol === 'FAIL')!
  const plan = planPortfolioResearchBackfill({ now, holdings: [holding('FAIL'), holding('LITE')], reports: [], activeLimit: 1,
    jobs: [{ id: 'exhausted', ownerId, symbol: 'FAIL', status: 'failed', createdAt: now.toISOString(), researchRetryCount: 2, dedupeKey: failed.dedupeKey }],
  })
  assert.deepEqual(plan.blocked.map(target => [target.symbol, target.queueStatus]), [['FAIL', 'retry_exhausted']])
  assert.deepEqual(plan.selected.map(target => target.symbol), ['LITE'])
})

test('known baseline gaps must be reviewed before a holding counts as upgraded', () => {
  const note = { ...report('TSLA'), packet: { sources: [{ id: 'source-1' }], evidenceQuality: { missing: ['cash flow'] } } }
  const plan = planPortfolioResearchBackfill({ now, holdings: [holding('TSLA')], reports: [note], jobs: [] })
  assert.equal(plan.completed.length, 0)
  assert.equal(plan.pending[0].reason, 'contract_upgrade')
})
