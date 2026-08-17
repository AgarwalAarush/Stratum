import test from 'node:test'
import assert from 'node:assert/strict'

import { selectCurrentMarketThesisVersions } from '../lib/server/world-memory.ts'
import type { MarketThesisVersion } from '../lib/markets/types.ts'

function thesis(id: string, hypothesisId: string, version: number, generatedAt: string): MarketThesisVersion {
  return { id, hypothesisId, version, generatedAt } as MarketThesisVersion
}

test('market thesis workspace exposes only the current immutable version for each hypothesis', () => {
  const current = selectCurrentMarketThesisVersions([
    thesis('power-v2', 'power', 2, '2026-08-16T10:00:00.000Z'),
    thesis('materials-v1', 'materials', 1, '2026-08-16T11:00:00.000Z'),
    thesis('power-v3', 'power', 3, '2026-08-17T10:00:00.000Z'),
  ])

  assert.deepEqual(current.map((item) => item.id), ['power-v3', 'materials-v1'])
})
