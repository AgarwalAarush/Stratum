import test from 'node:test'
import assert from 'node:assert/strict'

import { formatMarketDate } from '../lib/markets/format-date.ts'

test('market date formatting preserves date-only SEC filing periods', () => {
  assert.equal(formatMarketDate('2026-04-30'), 'Apr 30, 2026')
})

test('ownership checkpoints retain their calendar date while captured timestamps retain Pacific time',()=>{
  assert.equal(formatMarketDate('2026-12-31','America/Los_Angeles'),'Dec 31, 2026')
  assert.equal(formatMarketDate('2026-12-31T00:00:00Z','America/Los_Angeles'),'Dec 30, 2026')
})
