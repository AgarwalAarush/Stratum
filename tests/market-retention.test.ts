import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { marketRetentionCutoffs } from '../lib/server/market-retention.ts'

test('market retention keeps short-lived snapshots separate from durable memo artifacts', async () => {
  const cutoffs = marketRetentionCutoffs(new Date('2026-07-29T12:00:00.000Z'), {})
  assert.equal(cutoffs.marketSnapshotsBefore, '2026-07-22T12:00:00.000Z')
  assert.equal(cutoffs.crossAssetBefore, '2026-06-29T12:00:00.000Z')
  assert.equal(cutoffs.agentJobsBefore, '2026-06-29T12:00:00.000Z')

  const source = await readFile(new URL('../lib/server/market-retention.ts', import.meta.url), 'utf8')
  assert.match(source, /market_memos/)
  assert.match(source, /protectedSnapshotIds/)
  assert.match(source, /cross_asset_snapshots/)
  assert.match(source, /succeeded', 'failed', 'cancelled/)
})
