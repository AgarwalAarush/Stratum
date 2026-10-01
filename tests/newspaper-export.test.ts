import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { MARKETS_OWNER_ID, createMarketsPasswordHash, createMarketsSessionToken, verifyMarketsSessionToken } from '../lib/auth/markets-auth.ts'
import { newspaperAnalysis, newspaperFreshness, newspaperPortfolio, type PublishedNewspaperAnalysis } from '../lib/markets/newspaper-export.ts'
import type { PortfolioAccountSummary } from '../lib/markets/types.ts'
import { serveNewspaperExport } from '../lib/server/newspaper-export.ts'
import { fetchPublishedNewspaperAnalysis } from '../lib/server/recommendation-reads.ts'

const now = new Date('2026-10-01T13:00:00Z')
const capture = '2026-10-01T12:15:00Z', quote = '2026-10-01T12:14:59Z'
const request = (suffix = '', method = 'GET') => new Request(`https://stratum.example/api/markets/newspaper${suffix}`, { method })
const authenticate = async () => ({ id: MARKETS_OWNER_ID })
function portfolio(): PortfolioAccountSummary {
  return {
    account: { id: 'personal', name: 'Personal', kind: 'brokerage', initialFunds: 0, startedAt: '2026-01-01', createdAt: '2026-01-01' },
    cashBalance: 300, investedCost: 630, marketValue: 700, totalValue: 1000, unrealizedPnl: 70,
    dataSource: 'robinhood', dataAsOf: capture,
    holdings: [{ symbol: 'EXAMPLE', quantity: 7, costBasisPerShare: 90, totalCost: 630,
      currentPrice: 100, currentValue: 700, unrealizedPnl: 70, quoteAsOf: quote, quoteSource: 'robinhood' }],
  }
}
function published(): PublishedNewspaperAnalysis {
  return {
    batch: { id: 'edition', decision_date: '2026-10-01', published_at: capture, summary: 'Fictional test edition', secret: 'do-not-export' },
    versions: [{ id: 'recommendation', content: { symbol: 'EXAMPLE', portfolioId: 'personal', action: 'hold', reason: 'Published test rationale',
      thesis: 'Published test thesis', expiresAt: '2026-10-02T12:00:00Z', sourceIds: ['source'], confidence: 70,
      entry: { condition: 'Wait for evidence', maxPrice: null, secret: 'do-not-export' }, dimensions: { thesisQuality: 'Reviewed', token: 'do-not-export' }, raw: 'do-not-export' } }],
    manifest: { cutoff: '2026-10-01T12:00:00Z', policy: 'prospective-test', gaps: [], ownerId: 'do-not-export', portfolio: 'do-not-export',
      evidence: [{ id: 'source', url: 'https://www.sec.gov/Archives/example', asOf: '2026-09-30T20:00:00Z', availableAt: capture, retrievedAt: capture, feed: 'SEC', value: { secret: 'do-not-export' } }] },
  }
}
const dependencies = () => ({ authenticate, portfolios: async () => [portfolio()], analysis: async () => published(), now: () => now })

test('signed owner session is required; invalid, expired, missing auth and non-owner identities do not read data', async () => {
  const env = { NODE_ENV: 'development', MARKETS_AUTH_BYPASS: 'true',
    MARKETS_ACCESS_PASSWORD_HASH: await createMarketsPasswordHash('fixture-only', new Uint8Array(16), 100_000),
    MARKETS_SESSION_SECRET: 'fixture-only-secret-at-least-32-characters' } as NodeJS.ProcessEnv
  const token = await createMarketsSessionToken(env, now.getTime())
  let reads = 0
  for (const candidate of [undefined, 'invalid', `${token}.tampered`, await createMarketsSessionToken(env, now.getTime() - 31 * 86400000)]) {
    const result = await serveNewspaperExport(request(), { authenticate: async () =>
      await verifyMarketsSessionToken(candidate ?? undefined, env, now.getTime()) ? { id: MARKETS_OWNER_ID } : null,
    portfolios: async () => { reads++; return [portfolio()] } })
    assert.equal(result.status, 401)
    assert.equal(result.headers.get('Cache-Control'), 'private, no-store, max-age=0')
  }
  assert.equal(reads, 0)
  for (const authenticate of [async () => ({ id: 'other-user' }), async () => { throw new Error('auth-secret') }]) {
    const result = await serveNewspaperExport(request(), { ...dependencies(), authenticate })
    assert.equal(result.status, 401)
    assert.doesNotMatch(await result.text(), /auth-secret|Personal/)
  }
  assert.equal(await verifyMarketsSessionToken(token!, env, now.getTime()), true)
})

test('owner / refresh queries and mutation methods cannot broaden scope or cause reads', async () => {
  let reads = 0
  const deps = { ...dependencies(), portfolios: async () => { reads++; return [portfolio()] } }
  for (const query of ['?ownerId=another-owner', '?refresh=true', '?portfolioId=other', '?all=true']) {
    assert.equal((await serveNewspaperExport(request(query), deps)).status, 400)
  }
  for (const method of ['POST', 'PUT', 'DELETE']) assert.equal((await serveNewspaperExport(request('', method), deps)).status, 405)
  assert.equal(reads, 0)
})

test('export preserves broker amounts and separate capture/quote dates, projecting only safe fields', async () => {
  const p = portfolio() as PortfolioAccountSummary & { token: string }
  p.token = 'do-not-export'
  Object.assign(p.account, { accountNumber: 'do-not-export' })
  const response = await serveNewspaperExport(request(), { ...dependencies(), portfolios: async ownerId => {
    assert.equal(ownerId, MARKETS_OWNER_ID); return [p]
  } })
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('Vary'), 'Cookie')
  assert.match(response.headers.get('Content-Disposition')!, /attachment/)
  const data = await response.json()
  assert.equal(data.schemaVersion, 1)
  assert.equal(data.exportedAt, now.toISOString())
  assert.equal(data.readiness.ready, true)
  assert.equal(data.portfolios[0].cashBalance, 300)
  assert.equal(data.portfolios[0].totalValue, 1000)
  assert.equal(data.portfolios[0].unrealizedPnl, 70)
  assert.equal(data.portfolios[0].dataAsOf, capture)
  assert.equal(data.portfolios[0].holdings[0].quoteAsOf, quote)
  assert.equal(data.portfolios[0].holdings[0].quantity, 7)
  assert.equal(data.portfolios[0].holdings[0].unrealizedPnl, 70)
  assert.doesNotMatch(JSON.stringify(data), /do-not-export/)
})

test('missing holdings fails closed; unavailable analysis preserves holdings with explicit failure and no raw errors', async () => {
  const holdingsFailure = await serveNewspaperExport(request(), { ...dependencies(), portfolios: async () => { throw new Error('database-secret') } })
  assert.equal(holdingsFailure.status, 503)
  assert.deepEqual(await holdingsFailure.json(), { error: 'Authoritative portfolio export unavailable', errors: [{ scope: 'portfolio', code: 'read_failed' }] })
  const analysisFailure = await serveNewspaperExport(request(), { ...dependencies(), analysis: async () => { throw new Error('provider-secret') } })
  assert.equal(analysisFailure.status, 200)
  const data = await analysisFailure.json()
  assert.equal(data.portfolios.length, 1)
  assert.equal(data.analysis.status, 'unavailable')
  assert.deepEqual(data.errors, [{ scope: 'analysis', code: 'read_failed' }])
  assert.equal(data.readiness.ready, false)
  assert.doesNotMatch(JSON.stringify(data), /provider-secret/)
})

test('stale, future, absent prices and unproven UI prices never become fresh quote evidence', () => {
  for (const asOf of ['2026-09-29T12:00:00Z', '2026-10-02T12:00:00Z', null]) {
    assert.notEqual(newspaperFreshness(asOf, now).status, 'fresh')
  }
  const p = portfolio()
  p.holdings[0].quoteAsOf = null
  const missing = newspaperPortfolio(p, now)
  assert.equal(missing.holdings[0].currentPrice, null)
  assert.equal(missing.holdings[0].currentValue, null)
  assert.equal(missing.holdings[0].unrealizedPnl, null)
  assert.equal(missing.totalValue, 1000, 'Broker totals retain independently supported capture evidence')
  assert.equal(missing.readiness.ready, false)
  p.holdings[0].quoteAsOf = '2026-09-29T12:00:00Z'
  assert.equal(newspaperPortfolio(p, now).holdings[0].freshness.status, 'stale')
  p.holdings[0].quoteSource = null
  assert.equal(newspaperPortfolio(p, now).holdings[0].currentPrice, null)
})

test('manual budgets, stale capital dates and invalidated confirmations stay distinct from brokerage cash', () => {
  const p = portfolio()
  p.dataSource = 'manual_snapshot'; p.account.kind = 'manual'; p.confirmedAt = capture
  p.capitalAsOf = '2026-09-28T12:00:00Z'; p.allocationBudget = { total: 1000, holdingsValue: 700 }
  p.marketValue = null; p.totalValue = null; p.unrealizedPnl = null
  p.holdings[0].currentPrice = null; p.holdings[0].quoteAsOf = null; p.holdings[0].quoteSource = null
  const result = newspaperPortfolio(p, now)
  assert.equal(result.cashBalance, null)
  assert.equal(result.availableAllocation, 300)
  assert.equal(result.capitalBasis, 'owner_budget')
  assert.equal(result.capitalFreshness.status, 'stale')
  assert.equal(result.totalValue, null)
  p.dataAsOf = null
  assert.ok(newspaperPortfolio(p, now).readiness.flags.includes('manual_capture_invalidated'))
  p.dataSource = 'ledger'; delete p.allocationBudget
  assert.ok(newspaperPortfolio(p, now).readiness.flags.includes('ledger_fallback'))
})

test('malformed or unpublished evidence is not exported as ready analysis', async () => {
  const input = published()
  input.batch.published_at = null
  const response = await serveNewspaperExport(request(), { ...dependencies(), analysis: async () => input })
  const data = await response.json()
  assert.equal(data.analysis.status, 'unavailable')
  assert.deepEqual(data.errors, [{ scope: 'analysis', code: 'read_failed' }])
  assert.deepEqual(newspaperAnalysis(null, now).readiness.flags, ['no_published_edition'])
  const expired = published()
  Object.assign(expired.versions[0].content as object, { expiresAt: '2026-09-30T12:00:00Z', sourceIds: ['missing'] })
  const result = newspaperAnalysis(expired, now)
  assert.equal(result.recommendations[0].expired, true)
  assert.ok(result.readiness.flags.includes('missing_source_references'))
  expired.manifest.evidence = [{ id: 'secret-link', url: 'https://example.com?access_token=secret' }]
  assert.equal(newspaperAnalysis(expired, now).sources[0].url, null)
})

test('empty successful brokerage snapshot is retained; no holdings invented from a ledger', async () => {
  const p = portfolio(); p.holdings = []; p.investedCost = 0; p.marketValue = 0; p.totalValue = 300; p.unrealizedPnl = 0
  const result = await serveNewspaperExport(request(), { ...dependencies(), portfolios: async () => [p] })
  const data = await result.json()
  assert.deepEqual(data.portfolios[0].holdings, [])
  assert.equal(data.portfolios[0].cashBalance, 300)
  p.dataAsOf = 'bad-date'
  assert.equal((await serveNewspaperExport(request(), { ...dependencies(), portfolios: async () => [p] })).status, 503)
})

test('published edition reader scopes every query to owner and published batch, and only performs GETs', async context => {
  process.env.SUPABASE_URL = 'https://newspaper-test.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'fixture-only-key'
  const requests: URL[] = []
  let missing = false, fail = false, oversized = false
  context.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    assert.equal(init?.method, 'GET')
    const url = new URL(String(input)); requests.push(url)
    assert.equal(url.searchParams.get('owner_id'), `eq.${MARKETS_OWNER_ID}`)
    const table = url.pathname.split('/').pop()
    if (fail) return Response.json({ message: 'fixture-only-error' }, { status: 503 })
    if (table === 'recommendation_batches') return Response.json(missing ? null : published().batch)
    if (table === 'recommendation_versions') return Response.json(oversized ? Array.from({ length: 1_000 }, () => published().versions[0]) : published().versions)
    if (table === 'recommendation_input_manifests') return Response.json(published().manifest)
    throw new Error(`Unexpected table ${table}`)
  })
  assert.ok(await fetchPublishedNewspaperAnalysis(MARKETS_OWNER_ID))
  assert.equal(requests.length, 3)
  assert.equal(requests[0].searchParams.get('published_at'), 'not.is.null')
  assert.equal(requests[0].searchParams.get('limit'), '1')
  assert.equal(requests[1].searchParams.get('batch_id'), 'eq.edition')
  assert.equal(requests[1].searchParams.get('limit'), '1000')
  assert.ok(requests.every(url => !url.searchParams.get('select')?.includes('*')))
  missing = true; requests.length = 0
  assert.equal(await fetchPublishedNewspaperAnalysis(MARKETS_OWNER_ID), null)
  assert.equal(requests.length, 1)
  missing = false; oversized = true
  await assert.rejects(fetchPublishedNewspaperAnalysis(MARKETS_OWNER_ID), /export bound/)
  fail = true
  await assert.rejects(fetchPublishedNewspaperAnalysis(MARKETS_OWNER_ID), /published edition/)
})

test('production route binds strict signed-cookie auth, never bypass, refresh, outbox or generation', async () => {
  const route = await readFile(new URL('../app/api/markets/newspaper/route.ts', import.meta.url), 'utf8')
  const session = await readFile(new URL('../lib/auth/markets-session.ts', import.meta.url), 'utf8')
  assert.match(route, /authenticate: getAuthenticatedMarketUser/)
  assert.match(route, /export const revalidate = 0/)
  assert.doesNotMatch(route, /export.*POST|enqueue|newsletter|generate|AUTH_BYPASS/)
  const strictAuth = session.slice(session.indexOf('export const getAuthenticatedMarketUser'), session.indexOf('export const getAllowedMarketUser'))
  assert.match(strictAuth, /verifyMarketsSessionToken/)
  assert.doesNotMatch(strictAuth, /marketsAuthBypassEnabled/)
})
