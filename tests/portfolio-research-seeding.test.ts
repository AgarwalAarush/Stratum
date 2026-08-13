import assert from 'node:assert/strict'
import test from 'node:test'

import { buildPortfolioResearchCoverage } from '../lib/server/portfolio-research-seeding.ts'

test('portfolio research starts with owned companies, then watchlists, then bounded adjacent peers', () => {
  const coverage = buildPortfolioResearchCoverage({
    ownedSymbols: ['MSFT', 'NVDA'],
    watchlistedSymbols: ['GRID', 'NVDA'],
    peerSymbolsByOwnedSymbol: new Map([
      ['MSFT', ['ORCL', 'NVDA', 'NOT-IN-UNIVERSE']],
      ['NVDA', ['AMD', 'ORCL']],
    ]),
    researchBySymbol: new Map([
      ['MSFT', { status: 'complete', generated_at: '2026-08-12T00:00:00.000Z' }],
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
    researchBySymbol: new Map([['AMD', { status: 'complete', generated_at: '2026-06-01T00:00:00.000Z' }]]),
    availableSymbols: new Set(['AMD']),
    now: new Date('2026-08-13T00:00:00.000Z'),
  })
  assert.deepEqual(coverage.targets.map((target) => target.symbol), ['AMD'])
})
