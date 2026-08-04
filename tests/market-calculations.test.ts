import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { calculateScreenerRow, calculateScreenerRowFromMetrics } from '../lib/markets/calculations.ts'
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
  const row = calculateScreenerRow(asset, snapshot, buildBars(400))

  assert.ok(row)
  assert.equal(row?.dailyChange, 10)
  assert.notEqual(row?.return5d, null)
  assert.notEqual(row?.return30d, null)
  assert.notEqual(row?.return90d, null)
  assert.notEqual(row?.return180d, null)
  assert.notEqual(row?.returnYtd, null)
  assert.notEqual(row?.return1y, null)
  assert.equal(row?.gap, 5)
  assert.equal(row?.relativeVolume, 2)
  assert.equal(row?.tradable, true)
  assert.equal(row?.range.length, 18)
  assert.ok((row?.fiftyDayAverage ?? 0) > 100)
  assert.ok((row?.fiftyTwoWeekPosition ?? -1) >= 0)
  assert.ok((row?.fiftyTwoWeekPosition ?? 101) <= 100)
})

test('market calculations anchor multi-period returns to daily history, not page-view provider requests', () => {
  const row = calculateScreenerRow(asset, snapshot, buildBars(252))

  assert.equal(row?.return5d, 8.91)
  assert.equal(row?.return30d, 3.77)
})

test('market calculations reject mismatched symbols and incomplete history', () => {
  assert.equal(calculateScreenerRow(asset, { ...snapshot, symbol: 'OTHER' }, buildBars(252)), null)
  assert.equal(calculateScreenerRow(asset, snapshot, buildBars(49)), null)
})

test('market calculations leave longer returns unavailable when a recent listing lacks the required lookback', () => {
  const row = calculateScreenerRow(asset, snapshot, buildBars(53))
  assert.ok(row)
  assert.notEqual(row?.return30d, null)
  assert.equal(row?.return90d, null)
  assert.equal(row?.return180d, null)
  assert.equal(row?.return1y, null)
})

test('market calculations exclude the partial current-day bar from historical averages', () => {
  const bars = buildBars(252)
  bars[0] = { ...bars[0]!, volume: 100_000_000, close: 500 }
  const row = calculateScreenerRow(asset, snapshot, bars)
  assert.equal(row?.relativeVolume, 2)
  assert.ok((row?.fiftyDayAverage ?? 0) < 150)
})

test('compact persisted history metrics produce the same live-row shape without loading every bar', () => {
  const row = calculateScreenerRowFromMetrics(asset, snapshot, {
    symbol: 'TEST', barCount: 252, averageVolume: 1_000_000, fiftyDayAverage: 105,
    yearLow: 80, yearHigh: 130, range: [100, 101, 102], close5d: 101,
    close30d: 100, close90d: 95, close180d: 90, closeYtd: 92, close1y: 85,
  })
  assert.ok(row)
  assert.equal(row?.relativeVolume, 2)
  assert.equal(row?.return5d, 8.91)
  assert.equal(row?.return1y, 29.41)
  assert.deepEqual(row?.range, [100, 101, 102])
})

test('screener history metric migration keeps compact reads server-side and service-only', () => {
  const sql = readFileSync(join(process.cwd(), 'supabase/migrations/202608040019_screener_history_metrics.sql'), 'utf8')
  const optimization = readFileSync(join(process.cwd(), 'supabase/migrations/202608040020_optimize_screener_history_metrics.sql'), 'utf8')
  assert.match(sql, /create or replace function public\.screener_history_metrics/)
  assert.match(sql, /row_number\(\) over \(partition by bars\.symbol/)
  assert.match(sql, /grant execute on function public\.screener_history_metrics\(text\[\], text, date\) to service_role/)
  assert.match(optimization, /create or replace function public\.screener_history_metrics/)
  assert.doesNotMatch(optimization, /left join lateral/)
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

test('return materialization fallback preserves feed provenance and only fills missing periods', () => {
  const sql = readFileSync(join(process.cwd(), 'supabase/migrations/202607290002_materialize_screener_returns.sql'), 'utf8')

  assert.match(sql, /market_bars_daily \(symbol, feed, trading_date desc\)/)
  assert.match(sql, /and feed = snapshot_feed/)
  assert.match(sql, /if new\.return_30d is null then/)
  assert.match(sql, /before insert or update/)
})

test('screener repository reads every materialized return period', () => {
  const source = readFileSync(join(process.cwd(), 'lib/server/markets-repository.ts'), 'utf8')

  assert.match(source, /return_5d,return_30d,return_90d,return_180d,return_ytd,return_1y/)
  assert.match(source, /stratum:markets:screener-rows:\$\{snapshotId\}/)
  assert.match(source, /stratum:markets:latest-snapshot-meta/)
})
