import test from 'node:test'
import assert from 'node:assert/strict'

import { reconcileFinancials } from '../lib/markets/financial-reconciliation.ts'
import { parseSecLiquidityFacts } from '../lib/server/sec-financials.ts'

test('financial reconciliation preserves Planet-like net cash by including short-term investments', () => {
  const reconciliation = reconcileFinancials([
    {
      date: '2026-04-30',
      cashAndCashEquivalents: 368_090_000,
      shortTermInvestments: 362_745_000,
      cashAndShortTermInvestments: 730_835_000,
      totalDebt: 447_569_000,
    },
  ], [
    { date: '2026-04-30', operatingCashFlow: 15_440_000, capitalExpenditure: -17_310_000, freeCashFlow: -1_870_000 },
  ], [
    {
      asOf: '2026-04-30',
      cashAndCashEquivalents: 368_090_000,
      shortTermInvestments: 362_745_000,
      grossDebt: 447_569_000,
      sourceUrl: 'https://www.sec.gov/example',
    },
  ])

  assert.ok(reconciliation)
  assert.equal(reconciliation.totalLiquidity, 730_835_000)
  assert.equal(reconciliation.grossDebt, 447_569_000)
  assert.equal(reconciliation.netCash, 283_266_000)
  assert.equal(reconciliation.liquiditySource, 'sec_edgar')
  assert.equal(reconciliation.calculatedFreeCashFlow, -1_870_000)
  assert.deepEqual(reconciliation.warnings, [])
})

test('financial reconciliation flags an FMP liquidity mismatch instead of silently mixing sources', () => {
  const reconciliation = reconcileFinancials([
    {
      date: '2026-01-31',
      cashAndCashEquivalents: 229_000_000,
      shortTermInvestments: 410_000_000,
      cashAndShortTermInvestments: 640_000_000,
      totalDebt: 447_000_000,
    },
  ], [], [
    {
      asOf: '2026-01-31',
      cashAndCashEquivalents: 229_441_000,
      shortTermInvestments: 410_649_000,
      grossDebt: 446_884_000,
      sourceUrl: 'https://www.sec.gov/example',
    },
  ])

  assert.ok(reconciliation)
  assert.equal(reconciliation.netCash, 193_206_000)
  assert.equal(reconciliation.warnings.length, 0)

  const mismatched = reconcileFinancials([
    {
      date: '2026-01-31',
      cashAndCashEquivalents: 100_000_000,
      shortTermInvestments: 100_000_000,
      cashAndShortTermInvestments: 200_000_000,
      totalDebt: 447_000_000,
    },
  ], [], [
    {
      asOf: '2026-01-31',
      cashAndCashEquivalents: 229_441_000,
      shortTermInvestments: 410_649_000,
      grossDebt: 446_884_000,
      sourceUrl: 'https://www.sec.gov/example',
    },
  ])
  assert.ok(mismatched)
  assert.match(mismatched.warnings[0] ?? '', /does not reconcile/)
})

test('SEC companyfacts parser retains same-period cash and short-term investments only', () => {
  const snapshots = parseSecLiquidityFacts({
    facts: {
      'us-gaap': {
        CashAndCashEquivalentsAtCarryingValue: {
          units: { USD: [
            { end: '2026-04-30', filed: '2026-06-05', form: '10-Q', val: 368_090_000 },
            { end: '2026-01-31', filed: '2026-03-23', form: '10-K', val: 229_441_000 },
          ] },
        },
        ShortTermInvestments: {
          units: { USD: [
            { end: '2026-04-30', filed: '2026-06-05', form: '10-Q', val: 362_745_000 },
            { end: '2026-01-31', filed: '2026-03-23', form: '10-K', val: 410_649_000 },
          ] },
        },
        ConvertibleNotesPayable: {
          units: { USD: [
            { end: '2026-04-30', filed: '2026-06-05', form: '10-Q', val: 447_569_000 },
            { end: '2026-01-31', filed: '2026-03-23', form: '10-K', val: 446_884_000 },
          ] },
        },
      },
    },
  }, 'https://data.sec.gov/example')

  assert.deepEqual(snapshots[0], {
    asOf: '2026-04-30',
    cashAndCashEquivalents: 368_090_000,
    shortTermInvestments: 362_745_000,
    grossDebt: 447_569_000,
    sourceUrl: 'https://data.sec.gov/example',
  })
})
