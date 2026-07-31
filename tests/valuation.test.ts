import test from 'node:test'
import assert from 'node:assert/strict'

import {
  forwardPriceToEarnings,
  selectForwardAnnualEstimate,
} from '../lib/markets/valuation.ts'

test('forward P/E uses the nearest positive annual EPS estimate after the data date', () => {
  const estimate = selectForwardAnnualEstimate([
    { date: '2025-12-31', estimatedEpsAvg: 5 },
    { date: '2027-12-31', estimatedEpsAvg: 12 },
    { date: '2026-12-31', estimatedEpsAvg: 10 },
  ], '2026-07-30T20:00:00.000Z')

  assert.deepEqual(estimate, { date: '2026-12-31', eps: 10 })
  assert.equal(forwardPriceToEarnings(225, estimate), 22.5)
})

test('forward P/E stays unavailable for missing or non-positive consensus EPS', () => {
  const estimate = selectForwardAnnualEstimate([
    { date: '2026-12-31', estimatedEpsAvg: -2 },
    { date: 'not-a-date', estimatedEpsAvg: 4 },
  ], '2026-07-30')

  assert.equal(estimate, null)
  assert.equal(forwardPriceToEarnings(100, estimate), null)
})
