import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { buildMarketLeadershipSnapshot, rankDailySubIndustries } from '../lib/markets/leadership.ts'
import { parseGicsConstituents, renderLeadershipSlack } from '../lib/server/market-leadership.ts'

function bars(symbol: string, slope: number) {
  return Array.from({ length: 260 }, (_, index) => ({
    symbol,
    tradingDate: new Date(Date.UTC(2026, 6, 28 - index)).toISOString().slice(0, 10),
    close: 100 - index * slope,
  }))
}

test('leadership builds equal-weight groups, breadth, divergences, and coverage', () => {
  const companies = [
    { symbol: 'AAA', company: 'Alpha', sector: 'Technology', subIndustry: 'Systems' },
    { symbol: 'BBB', company: 'Beta', sector: 'Technology', subIndustry: 'Systems' },
    { symbol: 'CCC', company: 'Gamma', sector: 'Energy', subIndustry: 'Refining' },
  ]
  const snapshot = buildMarketLeadershipSnapshot(
    companies,
    [...bars('AAA', 0.08), ...bars('BBB', -0.03), ...bars('CCC', 0.02)],
    {
      generatedAt: '2026-07-29T01:00:00.000Z',
      relativeVolumeBySymbol: new Map([['AAA', 1.4]]),
    },
  )

  assert.equal(snapshot.universeCount, 3)
  assert.equal(snapshot.usableCount, 3)
  assert.equal(snapshot.stocks.length, 3)
  assert.equal(snapshot.subIndustries.length, 1)
  assert.equal(snapshot.subIndustries[0]?.label, 'Systems')
  assert.equal(snapshot.subIndustries[0]?.constituentCount, 2)
  assert.equal(snapshot.stocks.find((stock) => stock.symbol === 'AAA')?.relativeVolume, 1.4)
  const dailyLeaders = rankDailySubIndustries(snapshot.stocks)
  assert.deepEqual(dailyLeaders, [{
    label: 'Systems',
    sector: 'Technology',
    constituentCount: 2,
    dayReturn: 0.03,
  }])
  assert.match(renderLeadershipSlack(snapshot), /Data quality/)
})

test('GICS CSV parser normalizes dotted symbols and quoted company names', () => {
  const csv = [
    'Symbol,Security,GICS Sector,GICS Sub-Industry',
    'BRK.B,"Berkshire Hathaway, Inc.",Financials,Multi-Sector Holdings',
  ].join('\n')
  assert.deepEqual(parseGicsConstituents(csv), [{
    symbol: 'BRK-B',
    company: 'Berkshire Hathaway, Inc.',
    sector: 'Financials',
    subIndustry: 'Multi-Sector Holdings',
  }])
})

test('leadership migration requires complete atomic publication', async () => {
  const sql = await readFile(new URL('../supabase/migrations/202607280002_market_leadership_and_candidates.sql', import.meta.url), 'utf8')
  for (const table of [
    'market_leadership_snapshots',
    'market_stock_metrics',
    'market_group_metrics',
    'market_divergence_signals',
    'candidate_briefs',
    'candidate_signals',
  ]) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${table}`))
  }
  assert.match(sql, /stock_count < 450/)
  assert.match(sql, /publish_market_leadership_snapshot/)
})
