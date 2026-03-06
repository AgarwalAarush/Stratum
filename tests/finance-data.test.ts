import test from 'node:test'
import assert from 'node:assert/strict'

import { clearCacheForTests } from '../lib/server/cache.ts'
import { fetchFinanceEarnings } from '../lib/data/finance-earnings.ts'
import { fetchFinanceDeals } from '../lib/data/finance-deals.ts'
import { fetchFinanceReports } from '../lib/data/finance-reports.ts'
import { GET as getFinanceDealsRoute } from '../app/api/finance/deals/route.ts'
import { GET as getMacroIndicatorsRoute } from '../app/api/macro/indicators/route.ts'

function disableRedisForTest() {
  const originalUrl = process.env.UPSTASH_REDIS_REST_URL
  const originalToken = process.env.UPSTASH_REDIS_REST_TOKEN
  process.env.UPSTASH_REDIS_REST_URL = ''
  process.env.UPSTASH_REDIS_REST_TOKEN = ''

  return () => {
    process.env.UPSTASH_REDIS_REST_URL = originalUrl
    process.env.UPSTASH_REDIS_REST_TOKEN = originalToken
  }
}

function rfc2822FromOffsetMs(offsetMs: number, baseMs: number = Date.now()): string {
  return new Date(baseMs + offsetMs).toUTCString()
}

test('fetchFinanceEarnings normalizes FMP rows and marks beat/miss', { concurrency: false }, async (t) => {
  clearCacheForTests()
  const restoreRedis = disableRedisForTest()

  const originalFetch = global.fetch
  const originalFmp = process.env.FMP_API_KEY

  process.env.FMP_API_KEY = 'test-fmp-key'

  global.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input)

    if (url.includes('financialmodelingprep.com/api/v3/earning_calendar')) {
      return new Response(
        JSON.stringify([
          {
            symbol: 'NVDA',
            name: 'NVIDIA Corp',
            date: '2026-03-05',
            fiscalDateEnding: '2026-01-31',
            eps: 1.02,
            epsEstimated: 0.9,
            revenue: 25000,
            revenueEstimated: 24000,
          },
          {
            symbol: 'MSFT',
            name: 'Microsoft Corp',
            date: '2026-03-10',
            fiscalDateEnding: '2026-03-31',
            eps: 2.5,
            epsEstimated: 2.6,
          },
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }

    return new Response('<rss><channel></channel></rss>', {
      status: 200,
      headers: { 'Content-Type': 'application/xml' },
    })
  }) as typeof fetch

  t.after(() => {
    global.fetch = originalFetch
    process.env.FMP_API_KEY = originalFmp
    restoreRedis()
  })

  const now = new Date('2026-03-06T12:00:00.000Z')
  const items = await fetchFinanceEarnings(10, { now })

  assert.ok(items.length >= 2)

  const nvda = items.find((item) => item.ticker === 'NVDA')
  const msft = items.find((item) => item.ticker === 'MSFT')

  assert.ok(nvda)
  assert.equal(nvda?.beat, true)
  assert.equal(nvda?.epsActual, 1.02)
  assert.equal(nvda?.epsEstimate, 0.9)

  assert.ok(msft)
  assert.equal(msft?.beat, false)
})

test('fetchFinanceEarnings enforces 14-day window and includes upcoming events', { concurrency: false }, async (t) => {
  clearCacheForTests()
  const restoreRedis = disableRedisForTest()

  const originalFetch = global.fetch
  const originalFmp = process.env.FMP_API_KEY

  process.env.FMP_API_KEY = ''

  global.fetch = (async () =>
    new Response(
      `
        <rss><channel>
          <item>
            <title>NVIDIA reports earnings next week</title>
            <link>https://example.com/upcoming</link>
            <pubDate>Fri, 13 Mar 2026 14:00:00 GMT</pubDate>
          </item>
          <item>
            <title>Microsoft beats earnings expectations</title>
            <link>https://example.com/recent</link>
            <pubDate>Thu, 05 Mar 2026 14:00:00 GMT</pubDate>
          </item>
          <item>
            <title>Apple earnings recap</title>
            <link>https://example.com/old</link>
            <pubDate>Mon, 01 Feb 2026 14:00:00 GMT</pubDate>
          </item>
        </channel></rss>
      `,
      { status: 200, headers: { 'Content-Type': 'application/xml' } },
    )) as typeof fetch

  t.after(() => {
    global.fetch = originalFetch
    process.env.FMP_API_KEY = originalFmp
    restoreRedis()
  })

  const now = new Date('2026-03-06T12:00:00.000Z')
  const items = await fetchFinanceEarnings(10, { calendarStyle: true, now })

  assert.ok(items.some((item) => item.ticker === 'NVDA'))
  assert.ok(items.some((item) => item.ticker === 'MSFT'))
  assert.ok(!items.some((item) => item.url.includes('/old')))

  assert.equal(items[0]?.ticker, 'NVDA')
})

test('fetchFinanceDeals dedupes and prioritizes M&A significance', { concurrency: false }, async (t) => {
  clearCacheForTests()
  const restoreRedis = disableRedisForTest()

  const originalFetch = global.fetch
  const originalFmp = process.env.FMP_API_KEY

  process.env.FMP_API_KEY = ''

  const nowMs = Date.now()
  const maDate = rfc2822FromOffsetMs(-2 * 60 * 60 * 1_000, nowMs)
  const fundingDate = rfc2822FromOffsetMs(-3 * 60 * 60 * 1_000, nowMs)

  global.fetch = (async () =>
    new Response(
      `
        <rss><channel>
          <item>
            <title>Company A acquires Company B in $2B merger</title>
            <link>https://example.com/ma</link>
            <pubDate>${maDate}</pubDate>
          </item>
          <item>
            <title>Company A acquires Company B in $2B merger</title>
            <link>https://example.com/ma</link>
            <pubDate>${maDate}</pubDate>
          </item>
          <item>
            <title>Startup C raises Series B financing</title>
            <link>https://example.com/funding</link>
            <pubDate>${fundingDate}</pubDate>
          </item>
        </channel></rss>
      `,
      { status: 200, headers: { 'Content-Type': 'application/xml' } },
    )) as typeof fetch

  t.after(() => {
    global.fetch = originalFetch
    process.env.FMP_API_KEY = originalFmp
    restoreRedis()
  })

  const items = await fetchFinanceDeals(20)

  assert.equal(items.length, 2)
  assert.equal(items[0]?.category, 'M&A')
  assert.equal(items[1]?.category, 'Funding')
})

test('fetchFinanceReports dedupes and sorts by recency descending', { concurrency: false }, async (t) => {
  clearCacheForTests()
  const restoreRedis = disableRedisForTest()

  const originalFetch = global.fetch
  const nowMs = Date.now()
  const newestDate = rfc2822FromOffsetMs(-60 * 60 * 1_000, nowMs)
  const olderDate = rfc2822FromOffsetMs(-48 * 60 * 60 * 1_000, nowMs)

  global.fetch = (async () =>
    new Response(
      `
        <rss><channel>
          <item>
            <title>New portfolio outlook</title>
            <link>https://example.com/new</link>
            <pubDate>${newestDate}</pubDate>
          </item>
          <item>
            <title>New portfolio outlook</title>
            <link>https://example.com/new</link>
            <pubDate>${newestDate}</pubDate>
          </item>
          <item>
            <title>Older market thesis</title>
            <link>https://example.com/old</link>
            <pubDate>${olderDate}</pubDate>
          </item>
        </channel></rss>
      `,
      { status: 200, headers: { 'Content-Type': 'application/xml' } },
    )) as typeof fetch

  t.after(() => {
    global.fetch = originalFetch
    restoreRedis()
  })

  const items = await fetchFinanceReports(20)

  assert.equal(items.length, 2)
  assert.equal(items[0]?.title, 'New portfolio outlook')
  assert.equal(items[1]?.title, 'Older market thesis')
})

test('finance deals route returns fresh then memory cache metadata', { concurrency: false }, async (t) => {
  clearCacheForTests()
  const restoreRedis = disableRedisForTest()

  const originalFetch = global.fetch
  const originalFmp = process.env.FMP_API_KEY

  process.env.FMP_API_KEY = ''
  const recentDate = rfc2822FromOffsetMs(-30 * 60 * 1_000)

  global.fetch = (async () =>
    new Response(
      `
        <rss><channel>
          <item>
            <title>Company A acquisition deal announced</title>
            <link>https://example.com/deal</link>
            <pubDate>${recentDate}</pubDate>
          </item>
        </channel></rss>
      `,
      { status: 200, headers: { 'Content-Type': 'application/xml' } },
    )) as typeof fetch

  t.after(() => {
    global.fetch = originalFetch
    process.env.FMP_API_KEY = originalFmp
    restoreRedis()
  })

  const first = await getFinanceDealsRoute()
  const second = await getFinanceDealsRoute()

  assert.equal(first.headers.get('X-Data-Source'), 'fresh')
  assert.equal(second.headers.get('X-Data-Source'), 'memory')
  assert.equal(first.headers.get('X-Cache-Tier'), 'medium')
})

test('finance deals route serves stale on upstream failure after TTL expiry', { concurrency: false }, async (t) => {
  clearCacheForTests()
  const restoreRedis = disableRedisForTest()

  const originalFetch = global.fetch
  const originalNow = Date.now
  const originalFmp = process.env.FMP_API_KEY
  let now = Date.now()

  process.env.FMP_API_KEY = ''
  Date.now = () => now
  const seededDate = rfc2822FromOffsetMs(-30 * 60 * 1_000, now)

  global.fetch = (async () =>
    new Response(
      `
        <rss><channel>
          <item>
            <title>Strategic merger announced</title>
            <link>https://example.com/stale-seed</link>
            <pubDate>${seededDate}</pubDate>
          </item>
        </channel></rss>
      `,
      { status: 200, headers: { 'Content-Type': 'application/xml' } },
    )) as typeof fetch

  const seeded = await getFinanceDealsRoute()
  assert.equal(seeded.headers.get('X-Data-Source'), 'fresh')

  now += 3_601_000
  global.fetch = (async () => {
    throw new Error('upstream down')
  }) as typeof fetch

  const stale = await getFinanceDealsRoute()
  const body = (await stale.json()) as { items: unknown[] }

  t.after(() => {
    global.fetch = originalFetch
    Date.now = originalNow
    process.env.FMP_API_KEY = originalFmp
    restoreRedis()
  })

  assert.equal(stale.headers.get('X-Data-Source'), 'stale')
  assert.ok(body.items.length > 0)
})

test('macro route returns safe empty payload when upstream is unavailable', { concurrency: false }, async (t) => {
  clearCacheForTests()
  const restoreRedis = disableRedisForTest()

  const originalFetch = global.fetch
  const originalFred = process.env.FRED_API_KEY

  process.env.FRED_API_KEY = ''

  global.fetch = (async () => {
    throw new Error('network down')
  }) as typeof fetch

  t.after(() => {
    global.fetch = originalFetch
    process.env.FRED_API_KEY = originalFred
    restoreRedis()
  })

  const response = await getMacroIndicatorsRoute()
  const body = (await response.json()) as { items: unknown[]; fetchedAt: string }

  assert.equal(response.status, 200)
  assert.deepEqual(body.items, [])
  assert.equal(typeof body.fetchedAt, 'string')
  assert.equal(response.headers.get('X-Data-Source'), 'none')
  assert.equal(response.headers.get('X-Cache-Tier'), 'slow')
})
