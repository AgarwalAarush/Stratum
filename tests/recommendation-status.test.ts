import test from 'node:test'
import assert from 'node:assert/strict'
import { recommendationStatus } from '../lib/markets/recommendation-status.ts'
import type { Recommendation } from '../lib/markets/recommendations.ts'
const now = Date.parse('2026-09-08T16:00:00Z')
const row = (extra: Partial<Recommendation> = {}) =>
  ({
    action: 'no_trade',
    reason: 'Research does not establish entry readiness.',
    gateReasons: [],
    expiresAt: '2026-09-09T16:00:00Z',
    ...extra,
  }) as Recommendation
test('deferred and rejected assessments never imply a portfolio all-clear', () => {
  const s = recommendationStatus(
    [
      row({ gateReasons: ['No evidence-backed, measurable forecast'] }),
      row(),
      row({ reason: 'Research and holdings evidence are stale.' }),
      row({ reason: 'Stable security identity is unavailable.' }),
    ],
    now,
  )
  assert.equal(s.title, 'No actionable recommendation yet')
  assert.equal(s.rejected, 1)
  assert.equal(s.deferred, 3)
  assert.deepEqual(
    new Set(s.reasons.map((r) => r.key)),
    new Set(['forecast', 'entry', 'stale', 'identity']),
  )
  assert.match(s.description, /not an all-clear/)
})
test('hold-only, empty, stale and approved editions have distinct states', () => {
  assert.equal(
    recommendationStatus([row({ action: 'hold' })], now).title,
    'No portfolio changes recommended',
  )
  assert.equal(recommendationStatus([], now).title, 'No assessment published')
  assert.equal(
    recommendationStatus([row({ expiresAt: '2026-09-07T00:00:00Z' })], now)
      .title,
    'Assessment needs refreshing',
  )
  assert.equal(
    recommendationStatus(
      [
        row({ action: 'buy' }),
        row({ action: 'sell', gateReasons: ['Invalid sizing'] }),
      ],
      now,
    ).approved,
    1,
  )
})
