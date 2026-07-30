import test from 'node:test'
import assert from 'node:assert/strict'
import { historyForPeriod, priceHistoryPeriod } from '../lib/markets/price-history.ts'

const history = Array.from({ length: 220 }, (_, index) => ({
  tradingDate: `2026-${String(Math.floor(index / 20) + 1).padStart(2, '0')}-${String((index % 20) + 1).padStart(2, '0')}`,
  close: 100 + index,
  volume: 1_000_000 + index,
}))

test('price history periods map to concise, user-facing labels', () => {
  assert.equal(priceHistoryPeriod('dailyChange').chartLabel, '1-day price history')
  assert.equal(priceHistoryPeriod('return30d').label, '1 month')
  assert.equal(priceHistoryPeriod('return1y').chartLabel, '1-year price history')
})

test('price history switches use the corresponding number of daily closes', () => {
  assert.equal(historyForPeriod(history, 'dailyChange').length, 2)
  assert.equal(historyForPeriod(history, 'return5d').length, 6)
  assert.equal(historyForPeriod(history, 'return30d').length, 31)
  assert.equal(historyForPeriod(history, 'return90d').length, 91)
  assert.equal(historyForPeriod(history, 'return180d').length, 181)
  assert.equal(historyForPeriod(history, 'return1y').length, history.length)
})

test('year-to-date price history starts at the current calendar year', () => {
  const acrossYears = [
    { tradingDate: '2025-12-31', close: 99, volume: 1 },
    { tradingDate: '2026-01-02', close: 100, volume: 2 },
    { tradingDate: '2026-07-30', close: 101, volume: 3 },
  ]
  assert.deepEqual(historyForPeriod(acrossYears, 'returnYtd').map((point) => point.tradingDate), ['2026-01-02', '2026-07-30'])
})
