import test from 'node:test'
import assert from 'node:assert/strict'
import { marketFeed, screenerHistory } from '../lib/server/screener-records.ts'

test('SQL text feeds retain known provenance and reject an unsupported feed', () => {
  for (const feed of ['illustrative', 'iex', 'sip', 'delayed_sip']) assert.equal(marketFeed(feed), feed)
  for (const feed of ['latest', null, 42]) assert.equal(marketFeed(feed), null)
})

test('JSON history validates provenance without replacing prices or inventing freshness', () => {
  const history = { through: '2026-10-02', feed: 'iex', barCount: 260, completeness: 'partial', windows: { liquidity: 20, movingAverage: 50, year: 252 } }
  assert.deepEqual(screenerHistory(history), history)
  assert.equal(screenerHistory(null), undefined)
  for (const patch of [{ feed: 'unknown' }, { through: 'invalid' }, { barCount: -1 }, { windows: { liquidity: 20 } }, { completeness: 'fresh' }]) {
    assert.equal(screenerHistory({ ...history, ...patch }), undefined)
  }
})
