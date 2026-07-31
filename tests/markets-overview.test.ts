import test from 'node:test'
import assert from 'node:assert/strict'
import { GET } from '../app/api/markets/overview/route.ts'
import { ILLUSTRATIVE_MARKET_OVERVIEW } from '../lib/markets/fixtures.ts'

test('Markets overview fixture is explicitly illustrative and internally timestamped', () => {
  assert.equal(ILLUSTRATIVE_MARKET_OVERVIEW.feed, 'illustrative')
  assert.equal(ILLUSTRATIVE_MARKET_OVERVIEW.dataAsOf, ILLUSTRATIVE_MARKET_OVERVIEW.state.dataAsOf)
  assert.ok(ILLUSTRATIVE_MARKET_OVERVIEW.evidence.length >= 3)
  assert.ok(ILLUSTRATIVE_MARKET_OVERVIEW.evidence.every((item) => Number.isFinite(Date.parse(item.publishedAt))))
  assert.ok(ILLUSTRATIVE_MARKET_OVERVIEW.memo.changes.length >= 3)
})

test('Markets overview route returns the public response contract and feed header', async () => {
  const response = await GET()
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.equal(response.headers.get('X-Market-Feed'), 'illustrative')
  assert.equal(body.state.regime, 'Risk-On, narrowing breadth')
  assert.equal(body.feed, 'illustrative')
  assert.equal(typeof body.generatedAt, 'string')
})
