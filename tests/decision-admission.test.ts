import test from 'node:test'
import assert from 'node:assert/strict'
import {
  admitDiscoveryCandidates,
  hasValidatedSystemThesis,
} from '../lib/markets/decision-admission.ts'

test('discovery preserves lane breadth, excludes dismissed/future rows and refreshes old leads', () => {
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
  const oldLeads = admitDiscoveryCandidates(rows, new Set(), '2026-10-01')
  assert.equal(oldLeads.length, 5)
  assert.ok(oldLeads.every(row => row.requiresResearchRefresh === true))
  assert.ok(oldLeads.every(row => String(row.admissionReason).includes('independent current research')))
})

test('a later dismissal or snooze cannot be bypassed using an older eligible brief', () => {
  const initial = { symbol: 'LITE', status: 'new', generated_at: '2026-09-01', content: { primaryLane: 'leadership' } }
  assert.equal(admitDiscoveryCandidates([initial, { ...initial, status: 'dismissed', generated_at: '2026-09-02' }], new Set(), '2026-10-01').length, 0)
  assert.equal(admitDiscoveryCandidates([initial, { ...initial, snoozed_until: '2026-11-01', generated_at: '2026-09-02' }], new Set(), '2026-10-01').length, 0)
})

test('discovery rotates toward never-reviewed names before already researched older briefs', () => {
  const candidates = ['AAA', 'BBB', 'CCC'].map(symbol => ({ symbol, status: 'new', generated_at: '2026-09-01', content: { primaryLane: 'leadership' } }))
  assert.deepEqual(admitDiscoveryCandidates(candidates, new Set(), '2026-10-01', 1, new Map([['AAA', '2026-09-30']])).map(row => row.symbol), ['BBB'])
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
