import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  appendMarketDailyBars,
  mergeMarketDailyBars,
  newestTimestamp,
  symbolsNeedingHistoryBackfill,
} from '../lib/server/markets-ingestion.ts'
import type { MarketDailyBar } from '../lib/markets/types.ts'

test('market snapshot provenance uses the newest observation rather than worker time', () => {
  const workerTime = '2026-07-16T01:06:50.824Z'
  const observations = [
    { asOf: '2026-07-15T19:58:00.000Z' },
    { asOf: '2026-07-15T20:00:00.000Z' },
    { asOf: '2026-07-15T19:59:00.000Z' },
  ]

  assert.equal(newestTimestamp(observations, workerTime), '2026-07-15T20:00:00.000Z')
  assert.equal(newestTimestamp([], workerTime), workerTime)
})

function bar(tradingDate: string, close: number): MarketDailyBar {
  return {
    symbol: 'TEST',
    tradingDate,
    open: close,
    high: close,
    low: close,
    close,
    volume: 100,
    tradeCount: null,
    vwap: close,
    feed: 'iex',
    asOf: `${tradingDate}T20:00:00.000Z`,
  }
}

test('incremental history replaces revised dates and keeps newest bars bounded', () => {
  const merged = mergeMarketDailyBars([
    bar('2026-07-27', 100),
    bar('2026-07-28', 101),
  ], [
    bar('2026-07-28', 102),
    bar('2026-07-29', 103),
  ], 2)
  assert.deepEqual(merged.map((item) => [item.tradingDate, item.close]), [
    ['2026-07-29', 103],
    ['2026-07-28', 102],
  ])
})

test('history accumulation handles a full-universe backfill without a spread overflow', () => {
  const source = Array.from({ length: 150_000 }, () => bar('2026-07-29', 103))
  const target: MarketDailyBar[] = []

  appendMarketDailyBars(target, source)

  assert.equal(target.length, source.length)
})

test('history backfill suppresses young symbols already attempted today', () => {
  const cache = new Map<string, MarketDailyBar[]>([
    ['COMPLETE', Array.from({ length: 252 }, (_, index) => bar(`2026-01-${index}`, 100))],
    ['YOUNG', Array.from({ length: 40 }, (_, index) => bar(`2026-02-${index}`, 100))],
  ])

  assert.deepEqual(
    symbolsNeedingHistoryBackfill(['COMPLETE', 'YOUNG', 'MISSING'], cache, new Set(['YOUNG'])),
    ['MISSING'],
  )
})

test('screener refresh explicitly aligns snapshots to the durable history feed instead of mixing delayed SIP and IEX', () => {
  const source = readFileSync(join(process.cwd(), 'lib/server/markets-ingestion.ts'), 'utf8')
  assert.match(source, /!hasUsableScreenerHistory\(historyMetrics\) && feed === 'delayed_sip'/)
  assert.match(source, /client\.fetchSnapshots\(symbols, 'iex'\)/)
  assert.match(source, /Never blend those feeds/)
  assert.match(source, /metric\.barCount >= 50/)
})
