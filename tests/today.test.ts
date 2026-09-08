import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  allocationPercent,
  signedPercent,
  summarizeTodayDecisions,
  type TodayDecision,
} from '../lib/markets/today.ts'
import { readFileSync } from 'node:fs'
const now = Date.parse('2026-01-01T00:00:00Z')
const decision = (overrides: Partial<TodayDecision> = {}): TodayDecision => ({
  symbol: 'EXAMPLE',
  portfolio_id: 'account',
  action: 'buy',
  reason: 'Reviewed case',
  expires_at: '2026-01-02T00:00:00Z',
  gate_reasons: [],
  ...overrides,
})
test('Today never promotes expired, blocked, or missing-review capital proposals', () => {
  const result = summarizeTodayDecisions(
    [
      decision(),
      decision({ gate_reasons: ['Missing sizing'] }),
      decision({ gate_reasons: null }),
      decision({ expires_at: '2025-12-31T00:00:00Z' }),
      decision({ action: 'research' }),
    ],
    now,
  )
  assert.equal(result.actionCount, 1)
  assert.equal(result.expired, 1)
  assert.equal(result.investigate, 1)
  assert.equal(result.blocked, 1)
})
test('Today limits action detail while retaining the full count', () => {
  const result = summarizeTodayDecisions(
    Array.from({ length: 10 }, () => decision()),
    now,
  )
  assert.equal(result.actionCount, 10)
  assert.equal(result.cleared.length, 3)
})
test('Allocation and sector graphics preserve missing data and signed values', () => {
  assert.equal(allocationPercent(null, 100), null)
  assert.equal(allocationPercent(10, 0), null)
  assert.equal(allocationPercent(25, 100), 25)
  assert.equal(signedPercent(-1.25), '-1.25%')
  assert.equal(signedPercent(null), 'Unavailable')
})
test('Today reads small completed projections and isolates owner reads', () => {
  const source = readFileSync(
    new URL('../lib/server/today.ts', import.meta.url),
    'utf8',
  )
  assert.match(source, /eq\('market_snapshots.status', 'complete'\)/)
  assert.match(source, /select\('portfolio:content->portfolio'\)/)
  assert.match(source, /portfolioCache.get\(ownerId/)
  assert.equal((source.match(/eq\('owner_id', ownerId\)/g) ?? []).length, 3)
  assert.doesNotMatch(
    source,
    /select\('\*'\)|recommendation_evaluations|fetchRecommendationWorkspace|composeLatestMarketOverview/,
  )
})
