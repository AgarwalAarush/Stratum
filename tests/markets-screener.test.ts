import test from 'node:test'
import assert from 'node:assert/strict'
import { POST } from '../app/api/markets/screener/route.ts'
import { DEFAULT_SCREENER_QUERY, parseScreenerQuery, runIllustrativeScreener } from '../lib/markets/screener.ts'

test('default screener applies deterministic conditions and relative-volume sorting', () => {
  const response = runIllustrativeScreener(DEFAULT_SCREENER_QUERY)

  assert.equal(response.feed, 'illustrative')
  assert.equal(response.pageSize, 10)
  assert.ok(response.total > 10)
  assert.ok(response.rows.every((row) => row.price > 10 && row.dailyChange > 0 && row.relativeVolume > 0.8 && row.price > row.fiftyDayAverage))
  assert.ok(response.rows[0]!.relativeVolume >= response.rows[1]!.relativeVolume)
})

test('screener parser rejects unsupported fields and oversized pages', () => {
  assert.throws(() => parseScreenerQuery({ ...DEFAULT_SCREENER_QUERY, filters: [{ id: 'bad', field: 'marketCap', operator: 'gt', value: 1, label: 'Bad' }] }), /field is not supported/)
  assert.throws(() => parseScreenerQuery({ ...DEFAULT_SCREENER_QUERY, pageSize: 51 }), /pageSize must be between 1 and 50/)
})

test('screener route returns structured validation errors', async () => {
  const request = new Request('http://localhost/api/markets/screener', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...DEFAULT_SCREENER_QUERY, sort: 'unknown' }),
  })
  const response = await POST(request)
  const body = await response.json()

  assert.equal(response.status, 400)
  assert.equal(body.error.code, 'INVALID_SCREENER_QUERY')
})

test('screener route paginates valid queries and exposes feed provenance', async () => {
  const request = new Request('http://localhost/api/markets/screener', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...DEFAULT_SCREENER_QUERY, page: 2, pageSize: 5 }),
  })
  const response = await POST(request)
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.equal(response.headers.get('X-Market-Feed'), 'illustrative')
  assert.equal(body.page, 2)
  assert.equal(body.rows.length, 5)
})
