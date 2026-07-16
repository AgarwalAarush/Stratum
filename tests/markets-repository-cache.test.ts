import test from 'node:test'
import assert from 'node:assert/strict'
import type { ScreenerRow } from '../lib/markets/types.ts'
import { getCachedSnapshotRows } from '../lib/server/markets-repository.ts'

test('immutable screener rows load only once per snapshot', async () => {
  let loads = 0
  const rows: ScreenerRow[] = []
  const loader = async () => {
    loads += 1
    return rows
  }

  const first = await getCachedSnapshotRows('cache-test-snapshot', loader)
  const second = await getCachedSnapshotRows('cache-test-snapshot', loader)

  assert.equal(first, rows)
  assert.equal(second, rows)
  assert.equal(loads, 1)
})
