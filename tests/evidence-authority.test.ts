import assert from 'node:assert/strict'
import test from 'node:test'
import { canonicalCausalVersions } from '../lib/markets/evidence-authority.ts'

test('shadow, legacy and historic versions cannot leak into promoted decision authority', () => {
  const base = { causal_key: 'world:power', state: 'active', source_kind: 'world_node', freshness: { canonical: true } }
  const rows = [{ ...base, id: 'old', created_at: '2026-09-01' }, { ...base, id: 'current', created_at: '2026-09-30' },
    { ...base, id: 'shadow', state: 'shadow', created_at: '2026-10-01' }, { ...base, id: 'legacy', source_kind: 'market_thesis', created_at: '2026-10-02' }]
  assert.deepEqual(canonicalCausalVersions(rows, false), [])
  assert.deepEqual(canonicalCausalVersions(rows, true).map(row => row.id), ['current'])
})
