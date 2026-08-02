import assert from 'node:assert/strict'
import test from 'node:test'
import { fiveYearPriceHistoryRange } from '../lib/server/stock-price-history.ts'

test('five-year on-demand history begins five calendar years before its request date', () => {
  assert.deepEqual(
    fiveYearPriceHistoryRange(new Date('2026-08-01T15:30:00.000Z')),
    { start: '2021-08-01', end: '2026-08-01' },
  )
})
