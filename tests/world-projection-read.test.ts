import test from 'node:test'
import assert from 'node:assert/strict'
import { fetchProjectedWorldNodes } from '../lib/server/world-projection.ts'

test('World overview excludes the journal archive and duplicate wide columns', async () => {
  process.env.SUPABASE_URL = 'http://127.0.0.1:54321'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'fixture-key'
  const original = globalThis.fetch
  const queries: URL[] = []
  globalThis.fetch = async input => {
    const url = new URL(String(input))
    queries.push(url)
    const journal = url.searchParams.get('kind') === 'eq.journal'
    return new Response(JSON.stringify([{ structured_content: { id: journal ? 'journal' : 'current' } }]), { headers: { 'Content-Type': 'application/json' } })
  }
  try {
    const nodes = await fetchProjectedWorldNodes('frozen-commit')
    assert.deepEqual(nodes.map(n => n.id).sort(), ['current', 'journal'])
    assert.ok(queries.every(q => q.searchParams.get('select') === 'structured_content' && q.searchParams.get('commit_sha') === 'eq.frozen-commit'))
    assert.equal(queries.find(q => q.searchParams.get('kind') === 'eq.journal')?.searchParams.get('limit'), '8')
    assert.equal(queries.find(q => q.searchParams.get('kind') === 'neq.journal')?.searchParams.get('status'), 'in.(active,monitoring)')
  } finally { globalThis.fetch = original }
})
