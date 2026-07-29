import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  CROSS_ASSET_INSTRUMENT_IDS,
  crossAssetMarketInstrument,
  normalizeFmpQuote,
  normalizeFredObservation,
  normalizeTreasuryRates,
  parseFredCsv,
} from '../lib/server/cross-asset.ts'

const retrievedAt = '2026-07-28T20:05:00.000Z'

test('FMP index normalization preserves the underlying instrument identity and provenance', () => {
  const observation = normalizeFmpQuote({
    id: 'sp500',
    symbol: '^GSPC',
    label: 'S&P 500',
    instrumentType: 'equity_index',
    unit: 'index_points',
    dataStatus: 'delayed',
  }, {
    symbol: '^GSPC',
    price: 6_412.17,
    change: 12.5,
    timestamp: 1_753_731_900,
  }, retrievedAt)

  assert.equal(observation.symbol, '^GSPC')
  assert.equal(observation.label, 'S&P 500')
  assert.equal(observation.instrumentType, 'equity_index')
  assert.equal(observation.source, 'fmp')
  assert.equal(observation.dataStatus, 'delayed')
  assert.ok((observation.changePercent ?? 0) > 0)
  assert.doesNotMatch(observation.label, /ETF/)
})

test('Treasury rates normalize as yields rather than bond proxies', () => {
  const observations = normalizeTreasuryRates([
    { date: '2026-07-28', year2: 3.91, year10: 4.22 },
  ], retrievedAt)

  assert.deepEqual(observations.map((item) => item.id), ['us-2y', 'us-10y'])
  assert.ok(observations.every((item) => item.instrumentType === 'treasury_yield'))
  assert.ok(observations.every((item) => item.unit === 'percent'))
  assert.ok(observations.every((item) => item.dataStatus === 'end_of_day'))
})

test('FRED CSV normalization uses the latest complete daily value and previous observation', () => {
  const points = parseFredCsv('DATE,DTWEXBGS\n2026-07-25,121.8\n2026-07-28,122.1\n')
  const observation = normalizeFredObservation({
    id: 'broad-usd',
    symbol: 'DTWEXBGS',
    label: 'Broad USD',
    instrumentType: 'currency_index',
    unit: 'index_points',
    dataStatus: 'end_of_day',
  }, points, retrievedAt)

  assert.equal(observation.value, 122.1)
  assert.equal(observation.previousValue, 121.8)
  assert.equal(observation.feedTimestamp, '2026-07-28T00:00:00.000Z')
  assert.equal(observation.source, 'fred')
})

test('presentation instruments retain source timestamps and delay state', () => {
  const observation = normalizeFredObservation({
    id: 'wti',
    symbol: 'DCOILWTICO',
    label: 'WTI',
    instrumentType: 'commodity',
    unit: 'usd',
    dataStatus: 'end_of_day',
  }, [{ date: '2026-07-27', value: 75 }, { date: '2026-07-28', value: 76 }], retrievedAt)
  const instrument = crossAssetMarketInstrument(observation)

  assert.equal(instrument.value, '$76.00')
  assert.equal(instrument.feedTimestamp, '2026-07-28T00:00:00.000Z')
  assert.equal(instrument.retrievedAt, retrievedAt)
  assert.equal(instrument.dataStatus, 'end_of_day')
  assert.match(instrument.sourceUrl, /fred/)
})

test('cross-asset publication migration requires a complete atomic snapshot', async () => {
  assert.equal(CROSS_ASSET_INSTRUMENT_IDS.length, 11)
  const sql = await readFile(
    new URL('../supabase/migrations/202607280001_private_cross_asset_foundation.sql', import.meta.url),
    'utf8',
  )
  assert.match(sql, /actual_count <> p_expected_count/i)
  assert.match(sql, /update public\.cross_asset_snapshots set is_latest = false/i)
  assert.match(sql, /enable row level security/i)
})
