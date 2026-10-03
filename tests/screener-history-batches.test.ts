import test from 'node:test'
import assert from 'node:assert/strict'
import type { CachedScreenerHistory, ScreenerHistoryMetrics } from '../lib/markets/calculations.ts'
import { fillScreenerHistoryGaps, loadScreenerHistoryMetrics } from '../lib/server/markets-ingestion.ts'

test('history gap reduction preserves its feed and New York observation cutoff', async () => {
  const symbols = ['ILMN', 'P']
  const calls: string[][] = []
  const db = { rpc: async (name: string, args: { p_symbols: string[]; p_feed: string; p_as_of: string }) => {
    assert.equal(name, 'screener_history_metrics_v2')
    assert.equal(args.p_feed, 'iex')
    assert.equal(args.p_as_of, '2026-09-29')
    if (args.p_symbols.length > 40) return { data: null, error: { message: 'statement timeout' } }
    calls.push(args.p_symbols)
    return { error: null, data: args.p_symbols.map(symbol => ({ symbol, bar_count: 263, average_volume: 1000,
      fifty_day_average: 100, year_low: 50, year_high: 150, range_values: [90, 100] })) }
  } } as unknown as Parameters<typeof loadScreenerHistoryMetrics>[0]
  const metrics = await loadScreenerHistoryMetrics(db, symbols, 'iex', '2026-09-30T00:30:00Z')
  assert.deepEqual(calls.flat(), symbols)
  assert.equal(metrics.size, 2)
  assert.equal(metrics.get('ILMN')?.barCount, 263)
  assert.equal(metrics.get('P')?.fiftyDayAverage, 100)
})

test('a failed history batch cannot be returned as complete history', async () => {
  const db = { rpc: async () => ({ data: null, error: { message: 'statement timeout' } }) } as unknown as Parameters<typeof loadScreenerHistoryMetrics>[0]
  await assert.rejects(loadScreenerHistoryMetrics(db, ['P'], 'iex', '2026-09-29'), /statement timeout/)
})

test('cached archive fallback still hydrates newly required constituents', async () => {
  const cached = new Map<string, CachedScreenerHistory>(Array.from({ length: 2500 }, (_, i) => {
    const symbol = `S${i}`
    return [symbol, { symbol, price: 100, return5d: null, return30d: null, return90d: null, return180d: null, returnYtd: null, return1y: null, relativeVolume: 1, range: [], fiftyDayAverage: 100, fiftyTwoWeekPosition: 50 }]
  }))
  const symbols = [...cached.keys(), 'ILMN', 'P']
  const metrics = new Map<string, ScreenerHistoryMetrics>()
  const db = { rpc: async (_name: string, args: { p_symbols: string[]; p_feed: string }) => {
    assert.deepEqual(args.p_symbols, ['ILMN', 'P'])
    assert.equal(args.p_feed, 'iex')
    return { error: null, data: args.p_symbols.map(symbol => ({ symbol, bar_count: 263, average_volume: 1000,
      fifty_day_average: 100, year_low: 50, year_high: 150, range_values: [90, 100] })) }
  } } as unknown as Parameters<typeof loadScreenerHistoryMetrics>[0]
  await fillScreenerHistoryGaps(db, symbols, 'iex', '2026-09-29', metrics, cached)
  assert.equal(metrics.size, 2)
  assert.equal(metrics.get('P')?.barCount, 263)
  assert.equal(cached.size, 2500)
})
