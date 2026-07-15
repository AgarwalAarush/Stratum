import test from 'node:test'
import assert from 'node:assert/strict'

import { AlpacaClient } from '../lib/server/alpaca.ts'

function jsonResponse(value: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json', ...headers } })
}

test('AlpacaClient retries rate limits and preserves feed provenance', async () => {
  const waits: number[] = []
  let calls = 0
  const client = new AlpacaClient({
    keyId: 'key',
    secretKey: 'secret',
    fetchImpl: async () => {
      calls += 1
      if (calls === 1) return jsonResponse({ message: 'rate limited' }, 429, { 'retry-after': '0.01' })
      return jsonResponse({ snapshots: {
        AAPL: {
          latestTrade: { p: 225, t: '2026-07-15T20:00:00Z' },
          dailyBar: { o: 220, h: 226, l: 219, c: 225, v: 1_000_000, t: '2026-07-15T20:00:00Z' },
          prevDailyBar: { c: 218 },
        },
      } })
    },
    wait: async (milliseconds) => { waits.push(milliseconds) },
  })

  const result = await client.fetchSnapshots(['AAPL'])
  assert.equal(calls, 2)
  assert.deepEqual(waits, [10])
  assert.equal(result.feed, 'delayed_sip')
  assert.equal(result.data[0]?.price, 225)
  assert.equal(result.data[0]?.previousClose, 218)
})

test('AlpacaClient falls back to IEX only for feed entitlement errors', async () => {
  const requestedFeeds: string[] = []
  const client = new AlpacaClient({
    keyId: 'key',
    secretKey: 'secret',
    maxAttempts: 1,
    fetchImpl: async (input) => {
      const feed = new URL(String(input)).searchParams.get('feed') ?? ''
      requestedFeeds.push(feed)
      if (feed === 'delayed_sip') return jsonResponse({ message: 'subscription does not permit feed' }, 403)
      return jsonResponse({ snapshots: {
        MSFT: {
          latestTrade: { p: 500, t: '2026-07-15T20:00:00Z' },
          dailyBar: { o: 495, h: 501, l: 493, c: 500, v: 750_000, t: '2026-07-15T20:00:00Z' },
          prevDailyBar: { c: 490 },
        },
      } })
    },
  })

  const result = await client.fetchSnapshots(['MSFT'])
  assert.deepEqual(requestedFeeds, ['delayed_sip', 'iex'])
  assert.equal(result.feed, 'iex')
  assert.equal(result.data[0]?.feed, 'iex')
})

test('AlpacaClient normalizes paginated daily bars', async () => {
  let page = 0
  const client = new AlpacaClient({
    keyId: 'key',
    secretKey: 'secret',
    fetchImpl: async () => {
      page += 1
      return jsonResponse({
        bars: { AAPL: [{ t: `2026-07-${page === 1 ? '14' : '15'}T04:00:00Z`, o: 1, h: 3, l: 0.5, c: 2, v: 100, n: 10, vw: 1.8 }] },
        next_page_token: page === 1 ? 'next' : null,
      })
    },
  })

  const result = await client.fetchDailyBars(['AAPL'], '2026-01-01', '2026-07-15')
  assert.equal(result.data.length, 2)
  assert.equal(result.data[0]?.tradingDate, '2026-07-14')
  assert.equal(result.data[1]?.tradeCount, 10)
  assert.equal(result.data[1]?.vwap, 1.8)
})

test('AlpacaClient normalizes the market clock', async () => {
  const client = new AlpacaClient({
    keyId: 'key',
    secretKey: 'secret',
    fetchImpl: async () => jsonResponse({
      timestamp: '2026-07-15T14:30:00Z',
      is_open: true,
      next_open: '2026-07-16T13:30:00Z',
      next_close: '2026-07-15T20:00:00Z',
    }),
  })

  const clock = await client.fetchClock()
  assert.equal(clock.isOpen, true)
  assert.equal(clock.nextClose, '2026-07-15T20:00:00Z')
})
