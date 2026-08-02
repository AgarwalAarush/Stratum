import test from 'node:test'
import assert from 'node:assert/strict'

import { formatMarketDate } from '../lib/markets/format-date.ts'

test('market date formatting preserves date-only SEC filing periods', () => {
  assert.equal(formatMarketDate('2026-04-30'), 'Apr 30, 2026')
})
