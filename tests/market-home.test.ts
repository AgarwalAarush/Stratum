import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('market home artifacts remain publishable after a newer screener snapshot', async () => {
  const source = await readFile(new URL('../lib/server/market-home.ts', import.meta.url), 'utf8')
  assert.match(source, /async function fetchMarketSnapshot\(snapshotId\?: string\)/)
  assert.match(source, /\.eq\('id', snapshotId\)/)
  assert.match(source, /composeLatestMarketOverview\(snapshot\)/)
  assert.doesNotMatch(source, /Requested market home snapshot is no longer current/)
})
