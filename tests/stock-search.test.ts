import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { rankStockSearchResults } from '../lib/markets/stock-search.ts'
import { searchLatestStocks } from '../lib/server/stock-search.ts'

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

test('stock search source reads the complete active asset catalog before screener rows', async () => {
  const source = await import('node:fs/promises').then(({ readFile }) => readFile(new URL('../lib/server/stock-search.ts', import.meta.url), 'utf8'))
  assert.match(source, /from\('market_assets'\)/)
  assert.match(source, /eq\('symbol', exactTicker\)/)
  assert.match(source, /screenable: Boolean\(screener\)/)
  assert.match(source, /price: screener \? Number\(screener\.price\) : null/)
  assert.equal(typeof searchLatestStocks, 'function')
})

test('stock search supports keyboard result selection without moving focus from the query', () => {
  const component = readFileSync(join(process.cwd(), 'components/markets/StockSearch.tsx'), 'utf8')
  const styles = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8')
  assert.match(component, /event\.key === 'ArrowDown'/)
  assert.match(component, /event\.key === 'ArrowUp'/)
  assert.match(component, /openStock\(results\[activeIndex\]\)/)
  assert.match(component, /aria-activedescendant=\{results\[activeIndex\]/)
  assert.match(component, /role="option"/)
  assert.match(styles, /\.markets-stock-search-result\[aria-selected="true"\] \{ background: var\(--market-surface\); \}/)
})
