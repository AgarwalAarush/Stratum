import test from 'node:test'
import assert from 'node:assert/strict'
import { newestTimestamp } from '../lib/server/markets-ingestion.ts'

test('market snapshot provenance uses the newest observation rather than worker time', () => {
  const workerTime = '2026-07-16T01:06:50.824Z'
  const observations = [
    { asOf: '2026-07-15T19:58:00.000Z' },
    { asOf: '2026-07-15T20:00:00.000Z' },
    { asOf: '2026-07-15T19:59:00.000Z' },
  ]

  assert.equal(newestTimestamp(observations, workerTime), '2026-07-15T20:00:00.000Z')
  assert.equal(newestTimestamp([], workerTime), workerTime)
})
