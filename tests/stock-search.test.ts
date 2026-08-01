import test from 'node:test'
import assert from 'node:assert/strict'

import { rankStockSearchResults } from '../lib/markets/stock-search.ts'

const stocks = [
  { symbol: 'MSFT', company: 'Microsoft Corporation' },
  { symbol: 'MSTR', company: 'Strategy Incorporated' },
  { symbol: 'ORCL', company: 'Oracle Corporation' },
]

test('stock search prioritizes exact tickers over company-name matches', () => {
  assert.deepEqual(rankStockSearchResults(stocks, 'msft').map((stock) => stock.symbol), ['MSFT'])
  assert.deepEqual(rankStockSearchResults(stocks, 'corp').map((stock) => stock.symbol), ['MSFT', 'ORCL', 'MSTR'])
})

test('stock search applies a result limit and returns no result for blank input', () => {
  assert.equal(rankStockSearchResults(stocks, 'r', 1).length, 1)
  assert.deepEqual(rankStockSearchResults(stocks, '   '), [])
})
