import test from 'node:test'
import assert from 'node:assert/strict'
import { exchangeSessionClose, lastCompletedSession } from '../lib/markets/market-sessions.ts'

test('completed sessions honor early closes, exchange-local DST and data delay', () => {
  const summer = { date: '2026-07-02', open: '09:30', close: '13:00' }
  const winter = { date: '2026-11-27', open: '09:30', close: '13:00' }
  assert.equal(new Date(exchangeSessionClose(summer)).toISOString(), '2026-07-02T17:00:00.000Z')
  assert.equal(new Date(exchangeSessionClose(winter)).toISOString(), '2026-11-27T18:00:00.000Z')
  assert.equal(lastCompletedSession([summer], new Date('2026-07-02T17:14:59Z')), null)
  assert.equal(lastCompletedSession([summer], new Date('2026-07-02T17:15:00Z'))?.date, summer.date)
  assert.equal(lastCompletedSession([summer], new Date('2026-07-05T12:00:00Z'))?.date, summer.date)
})
