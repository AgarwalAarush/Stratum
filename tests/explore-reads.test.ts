import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { exploreStockQuery, exploreView } from '../lib/markets/explore.ts'
import { DEFAULT_SCREENER_QUERY, parseScreenerQuery, runIllustrativeScreener } from '../lib/markets/screener.ts'
import { createDefaultWatchlistState } from '../lib/markets/watchlists.ts'
import { fetchExploreData } from '../lib/server/explore.ts'
import { fetchMarketWatchlists } from '../lib/server/market-watchlists.ts'
import { buildMarketLeadershipSnapshot } from '../lib/markets/leadership.ts'

test('group views serialize only displayed constituent fields and the selected taxonomy', async () => {
  const companies = ['AAA', 'BBB'].map(symbol => ({ symbol, company: symbol, sector: 'Technology', subIndustry: 'Systems' }))
  const snapshot = buildMarketLeadershipSnapshot(companies, companies.flatMap(company => Array.from({ length: 260 }, (_, index) => ({
    symbol: company.symbol, tradingDate: new Date(Date.UTC(2026, 8, 29 - index)).toISOString().slice(0, 10), close: 100 - index * 0.1,
  }))))
  const sources = {
    screener: async () => null, leadership: async () => snapshot,
    watchlists: async () => ({ watchlists: createDefaultWatchlistState([]), persisted: false }),
    symbols: async () => null,
  }
  for (const view of ['sectors', 'sub-industries'] as const) {
    const data = await fetchExploreData(view, 'owner', DEFAULT_SCREENER_QUERY, sources)
    assert.ok(data.view === 'sectors' || data.view === 'sub-industries')
    assert.ok(data.leadership)
    assert.equal(data.leadership.dataAsOf, snapshot.dataAsOf)
    assert.equal(data.leadership.usableCount, 2)
    assert.deepEqual(Object.keys(data.leadership.stocks[0]), ['symbol', 'sector', 'subIndustry', 'return30d', 'asOf'])
    assert.equal(data.leadership.stocks[0].asOf, snapshot.stocks[0].asOf)
    assert.equal(data.leadership.stocks[0].return30d, snapshot.stocks[0].return30d)
    assert.deepEqual(data.leadership.sectors, view === 'sectors' ? snapshot.sectors : [])
    assert.deepEqual(data.leadership.subIndustries, view === 'sub-industries' ? snapshot.subIndustries : [])
    assert.equal('divergences' in data.leadership, false)
  }
})

test('Explore loads only the selected view and never assembles the portfolio workspace', async () => {
  const calls: string[] = []
  const screener = runIllustrativeScreener(DEFAULT_SCREENER_QUERY)
  const watchlists = createDefaultWatchlistState(['AAPL'])
  const sources = {
    screener: async () => { calls.push('screener'); return screener },
    leadership: async () => { calls.push('leadership'); return null },
    watchlists: async (owner: string) => { calls.push(`watchlists:${owner}`); return { watchlists, persisted: true } },
    symbols: async (symbols: string[]) => { calls.push(`symbols:${symbols.join(',')}`); return screener },
  }
  const stocks = await fetchExploreData('stocks', 'owner', DEFAULT_SCREENER_QUERY, sources)
  assert.deepEqual(calls.splice(0), ['screener'])
  assert.equal(stocks.view, 'stocks')
  for (const view of ['sectors', 'sub-industries'] as const) {
    assert.deepEqual(await fetchExploreData(view, 'owner', DEFAULT_SCREENER_QUERY, sources), { view, leadership: null })
    assert.deepEqual(calls.splice(0), ['leadership'])
  }
  const lists = await fetchExploreData('watchlists', 'owner', DEFAULT_SCREENER_QUERY, sources)
  assert.deepEqual(calls.splice(0), ['watchlists:owner', `symbols:${watchlists.lists.flatMap(list => list.symbols).join(',')}`])
  assert.equal(lists.view, 'watchlists')
  if (lists.view === 'watchlists') assert.equal(lists.universe, screener)
  await assert.rejects(fetchExploreData('watchlists', 'owner', DEFAULT_SCREENER_QUERY, {
    ...sources, watchlists: async () => { throw new Error('Unavailable') },
  }))
  assert.deepEqual(calls, [])
})

test('Explore fallback stays explicitly illustrative and limited to tracked symbols', async () => {
  const sources = {
    screener: async () => null,
    leadership: async () => null,
    watchlists: async () => ({ watchlists: createDefaultWatchlistState(['AAPL']), persisted: false }),
    symbols: async () => null,
  }
  const data = await fetchExploreData('watchlists', 'owner', DEFAULT_SCREENER_QUERY, sources)
  assert.equal(data.view, 'watchlists')
  if (data.view !== 'watchlists') return
  assert.equal(data.universe.feed, 'illustrative')
  assert.equal(data.universe.total, data.universe.rows.length)
  const symbols = data.watchlists.lists.flatMap(list => list.symbols)
  assert.ok(data.universe.rows.every(row => symbols.includes(row.symbol)))
  const stocks = await fetchExploreData('stocks', 'owner', DEFAULT_SCREENER_QUERY, sources)
  assert.ok(stocks.view === 'stocks' && stocks.screener.feed === 'illustrative')
})

test('sector drill-downs initialize valid filters rather than losing the selected group', () => {
  const sample = runIllustrativeScreener(DEFAULT_SCREENER_QUERY).rows[0]
  for (const [group, kind, field] of [[sample.sector, 'sector', 'sector'], [sample.subIndustry, 'sub_industry', 'subIndustry']] as const) {
    const query = exploreStockQuery(group, kind)
    assert.deepEqual(parseScreenerQuery(query), query)
    assert.deepEqual(query.filters.at(-1)?.value, [group])
    assert.equal(query.filters.at(-1)?.field, field)
    const results = runIllustrativeScreener(query)
    assert.ok(results.rows.length > 0)
    assert.ok(results.rows.every(row => row[field] === group))
  }
  assert.equal(exploreStockQuery(['invalid']), DEFAULT_SCREENER_QUERY)
  assert.equal(exploreStockQuery('  '), DEFAULT_SCREENER_QUERY)
  assert.equal(exploreStockQuery('a'.repeat(121)), DEFAULT_SCREENER_QUERY)
  assert.equal(exploreView(['watchlists']), 'stocks')
  assert.equal(exploreView('watchlists'), 'watchlists')
})

test('watchlist reads are owner-scoped, read-only and do not hide database errors', async context => {
  process.env.SUPABASE_URL = 'https://explore-tests.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'fixture-key'
  const requests: URL[] = []
  let fail = false
  context.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, options?: RequestInit) => {
    const url = new URL(String(input))
    requests.push(url)
    assert.equal(options?.method, 'GET')
    assert.equal(url.pathname, '/rest/v1/market_watchlists')
    if (fail) return Response.json({ message: 'Unavailable' }, { status: 400 })
    return Response.json([{ id: 'database-id', client_id: 'ideas', name: 'Ideas', market_watchlist_items: [{ symbol: 'AAPL' }] }])
  })
  const result = await fetchMarketWatchlists('owner-one')
  assert.equal(result.persisted, true)
  assert.deepEqual(result.watchlists.lists.find(list => list.id === 'ideas')?.symbols, ['AAPL'])
  assert.equal(requests.length, 1)
  assert.equal(requests[0].searchParams.get('owner_id'), 'eq.owner-one')
  assert.equal(requests[0].searchParams.get('select'), 'id,client_id,name,market_watchlist_items(symbol)')
  fail = true
  await assert.rejects(fetchMarketWatchlists('owner-two'), /could not be loaded/)
  assert.equal(requests[1].searchParams.get('owner_id'), 'eq.owner-two')
})

test('Explore streams the selected panel and splits interactive tab bundles', () => {
  const page = readFileSync('app/markets/explore/page.tsx', 'utf8')
  const component = readFileSync('components/markets/MarketsExplore.tsx', 'utf8')
  assert.match(page, /<Suspense[\s\S]*<ExploreContent/)
  assert.doesNotMatch(page, /fetchPortfolioWorkspace/)
  assert.match(component, /dynamic\(\(\) => import\('\.\/MarketsScreener'\)/)
  assert.match(component, /dynamic\(\(\) => import\('\.\/MarketsWatchlists'\)/)
  assert.match(component, /initialQuery=\{data.query\}/)
  assert.match(component, /groupType=\$\{group.groupType\}/)
})
