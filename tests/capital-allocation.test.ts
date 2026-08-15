import assert from 'node:assert/strict'
import test from 'node:test'

import { buildCapitalDecisionChangeSummary, decisionReviewDue, evaluateCapitalConstraints } from '../lib/markets/capital-allocation.ts'
import type { PortfolioAccountSummary, ThesisDecision } from '../lib/markets/types.ts'

const portfolio: PortfolioAccountSummary = {
  account: { id: 'portfolio-a', name: 'Personal', kind: 'manual', initialFunds: 10_000, startedAt: '2026-01-01', createdAt: '2026-01-01T00:00:00Z' },
  cashBalance: 4_000, investedCost: 6_000, marketValue: 6_000, totalValue: 10_000, unrealizedPnl: 0,
  holdings: [{ symbol: 'NVDA', quantity: 20, costBasisPerShare: 100, totalCost: 2_000, currentPrice: 100, currentValue: 2_000, unrealizedPnl: 0 }],
  dataSource: 'ledger', dataAsOf: '2026-08-15T00:00:00Z',
}

test('capital constraints evaluate owner inputs without recommending size', () => {
  const assessment = evaluateCapitalConstraints({
    symbol: 'AMD', disposition: 'own', portfolio, allPortfolios: [portfolio],
    sizingInputs: { targetWeightPct: 12, maxPositionWeightPct: 10, maxCorrelatedWeightPct: 25, maxLiquidityDays: 2, correlationGroup: 'Semiconductors' },
    classificationBySymbol: new Map([['NVDA', 'Semiconductors'], ['AMD', 'Semiconductors']]),
    currentPrice: 100, currentVolume: 1_000_000, dataAsOf: '2026-08-15T00:00:00Z',
  })
  assert.equal(assessment.status, 'blocked')
  assert.equal(assessment.checks.find((item) => item.id === 'concentration')?.status, 'blocked')
  assert.match(assessment.checks.find((item) => item.id === 'cash_impact')?.summary ?? '', /incremental cash/)
})

test('watch decisions require no sizing inputs and capital reviews become due', () => {
  const assessment = evaluateCapitalConstraints({
    symbol: 'AMD', disposition: 'watch', portfolio, allPortfolios: [portfolio], sizingInputs: null,
    classificationBySymbol: new Map(), currentPrice: null, currentVolume: null, dataAsOf: '2026-08-15T00:00:00Z',
  })
  assert.equal(assessment.status, 'pass')
  assert.equal(decisionReviewDue({ createdAt: '2026-01-01T00:00:00Z' }, null, new Date('2026-08-15T00:00:00Z')), true)
})

test('decision versions retain an explicit structured change summary', () => {
  const prior = {
    id: 'decision-a', symbol: 'AMD', version: 1, disposition: 'watch', formalRating: 'HOLD', entryAction: 'wait', fairValue: 150,
    entryZoneLow: 120, entryZoneHigh: 130, conviction: 3, nextCatalyst: 'Earnings', killCriteria: [], rationale: 'Wait.', priceAtDecision: 140,
    createdAt: '2026-01-01T00:00:00Z', investmentThesisId: 'thesis-a', researchNoteId: 'research-a', portfolioId: 'portfolio-a',
    valuationSupport: 'Cash-flow range.', whatChanged: 'Initial.', changeSummary: [], sizingInputs: null, constraintStatus: 'pass',
  } satisfies ThesisDecision
  const changes = buildCapitalDecisionChangeSummary(prior, { ...prior, disposition: 'own', sizingInputs: { targetWeightPct: 5, maxPositionWeightPct: 8, maxCorrelatedWeightPct: 25, maxLiquidityDays: 3, correlationGroup: 'Semiconductors' } })
  assert.ok(changes.some((item) => item.includes('Disposition changed')))
  assert.ok(changes.some((item) => item.includes('sizing inputs changed')))
})
