import assert from 'node:assert/strict'
import test from 'node:test'

import { buildPortfolioResearchCoverage, fetchPortfolioResearchCoverage, loadLatestPortfolioResearchRows } from '../lib/server/portfolio-research-seeding.ts'
import { currentResearchContract } from './fixtures/current-research-contract.ts'

test('portfolio research starts with owned companies, then watchlists, then bounded adjacent peers', () => {
  const coverage = buildPortfolioResearchCoverage({
    ownedSymbols: ['MSFT', 'NVDA'],
    watchlistedSymbols: ['GRID', 'NVDA'],
    peerSymbolsByOwnedSymbol: new Map([
      ['MSFT', ['ORCL', 'NVDA', 'NOT-IN-UNIVERSE']],
      ['NVDA', ['AMD', 'ORCL']],
    ]),
    researchBySymbol: new Map([
      ['MSFT', { status: 'complete', generated_at: '2026-08-12T00:00:00.000Z', content: currentResearchContract() }],
      ['NVDA', { status: 'running', generated_at: '2026-08-13T00:00:00.000Z' }],
    ]),
    availableSymbols: new Set(['MSFT', 'NVDA', 'GRID', 'AMD', 'ORCL']),
    now: new Date('2026-08-13T00:00:00.000Z'),
    maxTargets: 4,
  })

  assert.deepEqual(coverage.ownedSymbols, ['MSFT', 'NVDA'])
  assert.deepEqual(coverage.watchlistedSymbols, ['GRID'])
  assert.deepEqual(coverage.adjacentSymbols, ['ORCL', 'AMD'])
  assert.deepEqual(coverage.targets.map((target) => [target.symbol, target.priority]), [
    ['GRID', 'watchlisted'],
    ['ORCL', 'adjacent'],
    ['AMD', 'adjacent'],
  ])
  assert.deepEqual(coverage.targets[1]?.relatedTo, ['MSFT', 'NVDA'])
})

test('stale completed research is eligible for a fresh independent pass', () => {
  const coverage = buildPortfolioResearchCoverage({
    ownedSymbols: ['AMD'],
    watchlistedSymbols: [],
    peerSymbolsByOwnedSymbol: new Map(),
    researchBySymbol: new Map([['AMD', { status: 'complete', generated_at: '2026-06-01T00:00:00.000Z', content: currentResearchContract() }]]),
    availableSymbols: new Set(['AMD']),
    now: new Date('2026-08-13T00:00:00.000Z'),
  })
  assert.deepEqual(coverage.targets.map((target) => target.symbol), ['AMD'])
  assert.deepEqual(coverage.coveredSymbols, [])
})

test('portfolio coverage retains unverified holdings and distinguishes contract upgrades from completed reports',()=>{
  const coverage=buildPortfolioResearchCoverage({ownedSymbols:['LEGACY','FUND','UNKNOWN','FUTURE'],watchlistedSymbols:[],peerSymbolsByOwnedSymbol:new Map(),researchBySymbol:new Map([
    ['LEGACY',{status:'complete',generated_at:'2026-10-02'}],['FUND',{status:'complete',generated_at:'2026-10-02',content:currentResearchContract()}],['FUTURE',{status:'complete',generated_at:'2027-01-01',content:currentResearchContract()}],
  ]),availableSymbols:new Set(['LEGACY','FUND','FUTURE']),fundSymbols:new Set(['FUND']),now:new Date('2026-10-03')})
  assert.deepEqual(coverage.ownedSymbols,['FUND','FUTURE','LEGACY','UNKNOWN'])
  assert.deepEqual(coverage.coveredSymbols,['FUND'])
  assert.deepEqual(coverage.unavailableSymbols,['UNKNOWN'])
  assert.deepEqual(coverage.targets.map(t=>t.symbol),['FUTURE','LEGACY'])
})

test('due owned funds use the ETF research path and cannot become company peer leads',()=>{
  const coverage=buildPortfolioResearchCoverage({ownedSymbols:['FUND'],watchlistedSymbols:[],peerSymbolsByOwnedSymbol:new Map([['FUND',['OTHERFUND','COMPANY']]]),researchBySymbol:new Map(),availableSymbols:new Set(['FUND','OTHERFUND','COMPANY']),fundSymbols:new Set(['FUND','OTHERFUND'])})
  assert.equal(coverage.targets[0].instrumentType,'etf')
  assert.deepEqual(coverage.adjacentSymbols,['COMPANY'])
})

test('a version label cannot count malformed company or fund research as current coverage', () => {
  const valid = currentResearchContract()
  const coverage = buildPortfolioResearchCoverage({
    ownedSymbols: ['COMPANY', 'FUND', 'NOCITES', 'UNKNOWN'], watchlistedSymbols: [], peerSymbolsByOwnedSymbol: new Map(),
    researchBySymbol: new Map([
      ['COMPANY', { status: 'complete', generated_at: '2026-10-02', research_contract_version: 1, content: { researchContractVersion: 1 } }],
      ['FUND', { status: 'complete', generated_at: '2026-10-02', research_contract_version: 1, content: { ...valid, advice: null } }],
      ['NOCITES', { status: 'complete', generated_at: '2026-10-02', research_contract_version: 1, content: { ...valid, sourceIds: [] } }],
    ]),
    availableSymbols: new Set(['COMPANY', 'FUND', 'NOCITES']), fundSymbols: new Set(['FUND']), now: new Date('2026-10-03'),
  })
  assert.equal(coverage.ownedSymbols.length, 4)
  assert.deepEqual(coverage.coveredSymbols, [])
  assert.deepEqual(coverage.unavailableSymbols, ['UNKNOWN'])
  assert.deepEqual(coverage.targets.map(target => [target.symbol, target.instrumentType]), [['COMPANY', 'equity'], ['FUND', 'etf'], ['NOCITES', 'equity']])
})

test('tracked research pagination finds an older holding beyond another company’s first 500 revisions', async t => {
  const previous = { SUPABASE_URL: process.env.SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY }
  process.env.SUPABASE_URL = 'https://coverage-pagination.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'fixture-key'
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })
  const requests: URL[] = []
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL) => {
    const url = new URL(String(input))
    requests.push(url)
    assert.equal(url.searchParams.get('owner_id'), 'eq.owner')
    if (url.searchParams.get('select') === 'id,symbol') {
      assert.equal(url.searchParams.get('symbol'), 'in.(ACTIVE,OLDER)')
      return Response.json(Number(url.searchParams.get('offset')) === 0
        ? Array.from({ length: 500 }, (_, index) => ({ id: `active-${index}`, symbol: 'ACTIVE' }))
        : [{ id: 'older-note', symbol: 'OLDER' }])
    }
    assert.equal(url.searchParams.get('id'), 'in.(active-0,older-note)')
    assert.ok(url.searchParams.get('select')?.includes('content'))
    return Response.json(['ACTIVE', 'OLDER'].map(symbol => ({ symbol, status: 'complete', generated_at: '2026-10-02', content: currentResearchContract() })))
  })
  const research = await loadLatestPortfolioResearchRows('equity_research_notes', 'owner', ['ACTIVE', 'OLDER', 'ACTIVE'])
  assert.equal(requests.length, 3)
  const coverage = buildPortfolioResearchCoverage({ ownedSymbols: ['ACTIVE', 'OLDER'], watchlistedSymbols: [], peerSymbolsByOwnedSymbol: new Map(), researchBySymbol: new Map(research.map(row => [row.symbol, row])), availableSymbols: new Set(['ACTIVE', 'OLDER']), now: new Date('2026-10-03') })
  assert.deepEqual(coverage.coveredSymbols, ['ACTIVE', 'OLDER'])
  assert.deepEqual(coverage.targets, [])
})

test('officially supported fund symbols retain their ETF path when the catalog name omits ETF', async t => {
  const previous = { SUPABASE_URL: process.env.SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY }
  process.env.SUPABASE_URL = 'https://coverage-fund-path.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'fixture-key'
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })
  const owner = '00000000-0000-4000-8000-000000000001', capturedAt = '2026-10-02T16:00:00Z'
  const fixtures: Record<string, unknown> = {
    portfolios: [{ id: 'account', owner_id: owner, name: 'Manual', kind: 'manual', created_at: capturedAt }],
    portfolio_confirmations: [{ id: 'capture', portfolio_id: 'account', confirmed_at: capturedAt, as_of: capturedAt, content: { cash: 20, positions: [{ symbol: 'XLU', quantity: 1, costBasisPerShare: 80 }] } }],
    market_assets: [{ symbol: 'XLU', name: 'The Utilities Select Sector SPDR Fund' }],
  }
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL) => {
    const url = new URL(String(input)), table = url.pathname.split('/').at(-1)!
    return Response.json(fixtures[table] ?? [])
  })
  const coverage = await fetchPortfolioResearchCoverage(owner, { now: new Date(capturedAt) })
  assert.deepEqual(coverage.ownedSymbols, ['XLU'])
  assert.deepEqual(coverage.targets.map(target => [target.symbol, target.instrumentType]), [['XLU', 'etf']])
})
