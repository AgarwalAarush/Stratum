import test from 'node:test'
import assert from 'node:assert/strict'
import {
  admitDiscoveryCandidates,
  hasValidatedSystemThesis,
} from '../lib/markets/decision-admission.ts'

test('discovery preserves lane breadth and excludes dismissed, stale and future evidence', () => {
  const rows = ['AAA', 'BBB', 'CCC', 'DDD', 'EEE'].map((symbol, i) => ({
    symbol,
    status: 'new',
    generated_at: '2026-09-06T12:00:00Z',
    content: { primaryLane: i === 2 ? 'selloff' : 'strength' },
  }))
  assert.deepEqual(
    admitDiscoveryCandidates(rows, new Set(['EEE']), '2026-09-07', 2).map(
      (c) => c.symbol,
    ),
    ['AAA', 'CCC'],
  )
  assert.equal(
    admitDiscoveryCandidates(
      rows.map((c) => ({ ...c, status: 'dismissed' })),
      new Set(),
      '2026-09-07',
    ).length,
    0,
  )
  assert.equal(
    admitDiscoveryCandidates(rows, new Set(), '2026-08-01').length,
    0,
  )
  assert.equal(
    admitDiscoveryCandidates(rows, new Set(), '2026-10-01').length,
    0,
  )
})
test('system thesis requires a complete validated research artifact rather than a scout score', () => {
  const note = {
    status: 'complete',
    content: {
      investmentThesis: 'Long term thesis',
      keyDebate: 'Growth could disappoint',
      fastestKillSignal: 'Margins deteriorate',
      confidence: 60,
      sourceIds: ['issuer'],
      sections: Array(12).fill({}),
    },
  }
  const quality = { checkedAt: '2026-09-06', missing: [] }
  assert.equal(hasValidatedSystemThesis(note, quality, '2026-09-07'), true)
  assert.equal(
    hasValidatedSystemThesis(
      { ...note, status: 'running' },
      quality,
      '2026-09-07',
    ),
    false,
  )
  assert.equal(hasValidatedSystemThesis(note, {}, '2026-09-07'), false)
  assert.equal(hasValidatedSystemThesis(note, quality, '2026-09-05'), false)
})
