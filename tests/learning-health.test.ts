import test from 'node:test'
import assert from 'node:assert/strict'
import { publicationHealth, economicLearningSummary } from '../lib/markets/learning-health.ts'

test('fresh heartbeat cannot make an old or absent publication current', () => {
  const now = Date.parse('2026-09-29T12:00:00Z')
  assert.equal(publicationHealth('2026-09-22T12:00:00Z', 48, now), 'stale')
  assert.equal(publicationHealth(null, 48, now), 'unavailable')
  assert.equal(publicationHealth('2026-09-29T11:00:00Z', 2, now), 'current')
  assert.equal(publicationHealth('2026-09-30T11:00:00Z', 2, now), 'stale')
})
test('learning displays latest assessments without counting revisions as separate wins', () => {
  const rows = [
    { recommendation_id: 'r', horizon: '0', content: { outcome: false, forecast: { proposition: 'Revenue grew' } } },
    { recommendation_id: 'r', horizon: '0', content: { outcome: true } },
    { recommendation_id: 'pending', horizon: '0', content: { outcome: null } },
  ]
  assert.deepEqual(economicLearningSummary(rows).map(r => [r.confirmed, r.forecast]), [[false, 'Revenue grew']])
})
