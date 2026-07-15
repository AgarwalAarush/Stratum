import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { calculateScreenerRow } from '../lib/markets/calculations.ts'
import type { MarketAsset, MarketDailyBar, MarketSnapshot } from '../lib/markets/types.ts'

const asset: MarketAsset = {
  symbol: 'TEST',
  name: 'Test Systems, Inc.',
  exchange: 'NASDAQ',
  assetClass: 'us_equity',
  tradable: true,
  active: true,
}

const snapshot: MarketSnapshot = {
  symbol: 'TEST',
  price: 110,
  previousClose: 100,
  open: 105,
  high: 112,
  low: 104,
  volume: 2_000_000,
  asOf: '2026-07-15T20:00:00.000Z',
  feed: 'delayed_sip',
}

function buildBars(count: number): MarketDailyBar[] {
  return Array.from({ length: count }, (_, index) => ({
    symbol: 'TEST',
    tradingDate: new Date(Date.UTC(2026, 6, 15 - index)).toISOString().slice(0, 10),
    open: 90 + index * 0.1,
    high: 120 + index * 0.1,
    low: 80 + index * 0.05,
    close: 100 + index * 0.2,
    volume: 1_000_000,
    tradeCount: null,
    vwap: null,
    feed: 'delayed_sip',
    asOf: '2026-07-15T20:00:00.000Z',
  }))
}

test('market calculations derive price, gap, relative volume, moving average, and range position', () => {
  const row = calculateScreenerRow(asset, snapshot, buildBars(252))

  assert.ok(row)
  assert.equal(row?.dailyChange, 10)
  assert.equal(row?.gap, 5)
  assert.equal(row?.relativeVolume, 2)
  assert.equal(row?.tradable, true)
  assert.equal(row?.range.length, 18)
  assert.ok((row?.fiftyDayAverage ?? 0) > 100)
  assert.ok((row?.fiftyTwoWeekPosition ?? -1) >= 0)
  assert.ok((row?.fiftyTwoWeekPosition ?? 101) <= 100)
})

test('market calculations reject mismatched symbols and incomplete history', () => {
  assert.equal(calculateScreenerRow(asset, { ...snapshot, symbol: 'OTHER' }, buildBars(252)), null)
  assert.equal(calculateScreenerRow(asset, snapshot, buildBars(49)), null)
})

test('markets migration defines atomic publication, job claiming, and service-only access', () => {
  const sql = readFileSync(join(process.cwd(), 'supabase/migrations/202607150001_markets_core.sql'), 'utf8')

  for (const table of ['market_assets', 'market_bars_daily', 'market_snapshots', 'screener_rows', 'market_states', 'market_memos', 'agent_jobs', 'agent_runs']) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${table}`))
  }
  assert.match(sql, /create or replace function public\.publish_screener_snapshot/)
  assert.match(sql, /for update skip locked/)
  assert.match(sql, /grant execute on function public\.claim_agent_job\(text\) to service_role/)
})
