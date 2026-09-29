import test from 'node:test'
import assert from 'node:assert/strict'
import { fetchEquityResearchLibrary, fetchEtfResearchLibrary } from '../lib/server/research-library.ts'
import { fetchTodayMarket, fetchTodayPortfolio, summarizeTodayDecisions } from '../lib/server/today.ts'
import { fetchPortfolioResearchCoverage } from '../lib/server/portfolio-research-seeding.ts'
import { fetchWorldReplayStatus } from '../lib/server/world-replay.ts'
import { clearCacheForTests } from '../lib/server/cache.ts'

test('page reads are compact, owner-scoped, and preserve data dates and failure states', async context => {
  process.env.SUPABASE_URL = 'https://page-reads.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'fixture-key'
  delete process.env.UPSTASH_REDIS_REST_URL
  delete process.env.UPSTASH_REDIS_REST_TOKEN
  const owner = '00000000-0000-4000-8000-000000000001'
  const requests: URL[] = []
  let fail = ''
  const dataDate = '2026-09-01T20:00:00Z'
  const fixtures: Record<string, unknown> = {
    equity_research_notes: [{ id: 'note', symbol: 'OWNED', version: 2, status: 'complete', formal_rating: 'HOLD', entry_action: 'wait', key_debate: 'Demand durability', generated_at: dataDate }],
    etf_research_notes: [],
    recommendation_batches: { id: 'batch', manifest_id: 'manifest', published_at: dataDate },
    recommendation_versions: [{ symbol: 'OWNED', portfolio_id: 'portfolio', action: 'buy', reason: 'Reviewed', expires_at: '2026-09-02T20:00:00Z', gate_reasons: [] }],
    recommendation_input_manifests: { portfolio: [{ account: { id: 'portfolio', name: 'Personal' }, dataAsOf: dataDate, dataSource: 'robinhood', marketValue: 80, totalValue: 100, cashBalance: 20 }] },
    market_home_snapshots: { data_as_of: dataDate, feed: 'iex', regime: 'Recorded regime', instruments: [], sectors: [], catalysts: [], risks: [] },
    portfolios: [{ id: 'portfolio', name: 'Personal', kind: 'manual', created_at: dataDate }],
    portfolio_transactions: [],
    portfolio_confirmations: [{ id: 'confirmation', portfolio_id: 'portfolio', confirmed_at: dataDate, as_of: dataDate, content: { cash: 20, positions: [{ symbol: 'OWNED', quantity: 1, costBasisPerShare: 80 }] } }],
    market_watchlist_items: [],
    company_packets: [{ id: 'latest-packet', symbol: 'OWNED', peers: ['PEER'] }, { id: 'old-packet', symbol: 'OWNED', peers: ['OLD-PEER'] }],
    market_assets: [{ symbol: 'OWNED', name: 'Owned Company' }, { symbol: 'PEER', name: 'Peer Company' }],
    world_replay_runs: { id: 'replay', status: 'completed', cursor_at: dataDate },
    world_replay_batches: [],
  }
  context.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL) => {
    const url = new URL(String(input))
    requests.push(url)
    const table = url.pathname.split('/').pop()!
    if (table === fail) return Response.json({ message: 'Read failed' }, { status: 400 })
    assert.ok(table in fixtures, `Unexpected read: ${table}`)
    if (table === 'company_packets' && url.searchParams.get('id')) return Response.json([(fixtures.company_packets as unknown[])[0]])
    return Response.json(fixtures[table])
  })
  await context.test('research cards never load full notes or source ledgers', async () => {
    requests.length = 0
    const [notes, etfs] = await Promise.all([fetchEquityResearchLibrary(owner), fetchEtfResearchLibrary(owner)])
    assert.equal(notes[0].keyDebate, 'Demand durability')
    assert.equal(notes[0].generatedAt, dataDate)
    assert.deepEqual(etfs, [])
    assert.ok(requests.every(url => url.searchParams.get('owner_id') === `eq.${owner}`))
    assert.ok(requests.every(url => !url.searchParams.get('select')?.includes('*')))
    const debates = requests.find(url => url.searchParams.get('select') === 'id,key_debate:content->keyDebate')!
    assert.equal(debates.searchParams.get('id'), 'in.(note)')
    fail = 'equity_research_notes'
    await assert.rejects(fetchEquityResearchLibrary('another-owner'))
    fail = ''
  })
  await context.test('Today deduplicates reads, keeps dates, and evaluates cached decision expiry at display time', async () => {
    clearCacheForTests()
    requests.length = 0
    const [first, second] = await Promise.all([fetchTodayPortfolio(owner), fetchTodayPortfolio(owner)])
    assert.deepEqual(first, second)
    assert.equal(requests.length, 3)
    assert.ok(requests.every(url => url.searchParams.get('owner_id') === `eq.${owner}`))
    assert.equal(first?.accounts[0].asOf, dataDate)
    assert.equal(first?.accounts[0].source, 'robinhood')
    assert.equal(first?.accounts[0].total, 100)
    assert.equal(summarizeTodayDecisions(first!.decisions, Date.parse(dataDate)).actionCount, 1)
    assert.equal(summarizeTodayDecisions(first!.decisions, Date.parse('2026-09-03')).actionCount, 0)
    await fetchTodayPortfolio(owner)
    assert.equal(requests.length, 3)
    requests.length = 0
    await fetchTodayPortfolio('00000000-0000-4000-8000-000000000002')
    assert.equal(requests.length, 3)
    assert.ok(requests.every(url => url.searchParams.get('owner_id') === 'eq.00000000-0000-4000-8000-000000000002'))
  })
  await context.test('Today does not convert a failed manifest read into a safe assessment', async () => {
    fail = 'recommendation_input_manifests'
    await assert.rejects(fetchTodayPortfolio('00000000-0000-4000-8000-000000000003'))
    fail = ''
    requests.length = 0
    const market = await fetchTodayMarket()
    assert.equal(market?.data_as_of, dataDate)
    assert.equal(requests[0].searchParams.get('market_snapshots.status'), 'eq.complete')
  })
  await context.test('coverage reads only the latest peers for owned companies', async () => {
    requests.length = 0
    const coverage = await fetchPortfolioResearchCoverage(owner, { now: new Date(dataDate) })
    assert.deepEqual(coverage.ownedSymbols, ['OWNED'])
    assert.deepEqual(coverage.adjacentSymbols, ['PEER'])
    const packets = requests.filter(url => url.pathname.endsWith('/company_packets'))
    assert.equal(packets.length, 2)
    assert.equal(packets[0].searchParams.get('select'), 'id,symbol')
    assert.equal(packets[0].searchParams.get('symbol'), 'in.(OWNED)')
    assert.equal(packets[0].searchParams.get('owner_id'), `eq.${owner}`)
    assert.equal(packets[1].searchParams.get('select'), 'symbol,peers:packet->peers')
    assert.equal(packets[1].searchParams.get('id'), 'in.(latest-packet)')
  })
  await context.test('World summary skips replay evidence while System retains it', async () => {
    requests.length = 0
    const summary = await fetchWorldReplayStatus({ includeBatches: false })
    assert.equal(summary.run?.id, 'replay')
    assert.equal(requests.length, 1)
    await fetchWorldReplayStatus()
    assert.equal(requests.length, 3)
    assert.ok(requests[2].pathname.endsWith('/world_replay_batches'))
  })
})
