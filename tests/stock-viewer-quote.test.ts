import test from 'node:test'
import assert from 'node:assert/strict'
import { selectStockViewerQuote } from '../lib/server/markets-repository.ts'

test('stock viewer retains a newly listed security\'s latest persisted close before it qualifies for the screener', () => {
  const quote = selectStockViewerQuote(null, null, [
    { tradingDate: '2026-07-30', close: 100, volume: 1_000 },
    { tradingDate: '2026-07-31', close: 108.37, volume: 1_100 },
  ])

  assert.deepEqual(quote, {
    price: 108.37,
    dailyChange: 8.37,
    priceSource: 'daily_close',
  })
})

test('stock viewer never turns a missing quote into a zero-dollar price', () => {
  assert.deepEqual(selectStockViewerQuote(null, null, []), {
    price: null,
    dailyChange: null,
    priceSource: 'unavailable',
  })
})
