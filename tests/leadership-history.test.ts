import test from 'node:test'
import assert from 'node:assert/strict'
import { loadLeadershipBars } from '../lib/server/market-leadership.ts'

test('leadership history bounds symbol groups, completes all pages and fixes feed/date/order', async () => {
  process.env.SUPABASE_URL = 'http://127.0.0.1:54321'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'fixture'
  const original = globalThis.fetch
  const seen = new Set<string>()
  let calls = 0
  globalThis.fetch = async input => {
    const url = new URL(String(input)), p = url.searchParams
    assert.equal(p.get('feed'), 'eq.iex')
    assert.deepEqual(p.getAll('trading_date'), ['gte.2025-07-01', 'lte.2026-09-07'])
    assert.equal(p.get('order'), 'symbol.asc,trading_date.asc')
    const symbols = p.get('symbol')!.slice(3, -1).split(',')
    assert.ok(symbols.length <= 25)
    symbols.forEach(s => seen.add(s))
    calls++
    const offset = Number(p.get('offset') ?? 0)
    assert.ok(offset === 0 || offset === 1000)
    const all = Array.from({length: 1001}, (_, i) => ({symbol: symbols[0], trading_date: String(i), close: i}))
    return new Response(JSON.stringify(all.slice(offset, offset + 1000)), {status: 200, headers: {'content-type':'application/json'}})
  }
  try {
    const symbols = Array.from({length: 51}, (_, i) => `S${String(i).padStart(2, '0')}`)
    const result = await loadLeadershipBars([...symbols, symbols[0]], 'iex', '2025-07-01', '2026-09-07')
    assert.equal(seen.size, 51)
    assert.equal(calls, 6)
    assert.equal(result.length, 3003)
    assert.equal(result.filter(r => r.close === 1000).length, 3)
  } finally {
    globalThis.fetch = original
  }
})
