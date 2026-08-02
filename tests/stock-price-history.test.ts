import assert from 'node:assert/strict'
import test from 'node:test'
import { fiveYearPriceHistoryCacheKey, fiveYearPriceHistoryRange, normalizeFmpPriceHistory } from '../lib/server/stock-price-history.ts'

test('five-year on-demand history begins five calendar years before its request date', () => {
  assert.deepEqual(
    fiveYearPriceHistoryRange(new Date('2026-08-01T15:30:00.000Z')),
    { start: '2021-08-01', end: '2026-08-01' },
  )
})

test('on-demand FMP history cache keys are symbol and date range specific', () => {
  assert.equal(
    fiveYearPriceHistoryCacheKey('COHR', new Date('2026-08-01T15:30:00.000Z')),
    'stratum:markets:stock-history:fmp:COHR:2021-08-01:2026-08-01',
  )
})

test('FMP price history normalizes reverse chronological EOD rows for the chart', () => {
  assert.deepEqual(normalizeFmpPriceHistory([
    { date: '2026-07-31', close: 98.1, volume: 2_000 },
    { date: '2021-08-02', close: 45.2, volume: 1_000 },
    { date: '2024-01-01', close: 10, volume: Number.NaN },
  ]), [
    { tradingDate: '2021-08-02', close: 45.2, volume: 1_000 },
    { tradingDate: '2026-07-31', close: 98.1, volume: 2_000 },
  ])
})
