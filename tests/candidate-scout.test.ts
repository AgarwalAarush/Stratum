import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  rankCandidateUniverse,
  selectCandidateBriefs,
  type CandidateFundamentals,
} from '../lib/markets/candidates.ts'
import { multiLanePrefilter } from '../lib/server/candidate-scout.ts'
import type { MarketGroupMetric, StockLeadershipMetric } from '../lib/markets/types.ts'

function stock(symbol: string, subIndustry: string, return30d: number): StockLeadershipMetric {
  return {
    symbol,
    company: `${symbol} Corp`,
    sector: 'Technology',
    subIndustry,
    price: 100,
    dayReturn: 1,
    return5d: return30d / 4,
    return30d,
    return50d: 12,
    return200d: 24,
    return1y: 2,
    vs50DayAverage: 8,
    vs200DayAverage: 14,
    relativeVolume: 1.5,
    observationCount: 252,
    asOf: '2026-07-28T20:00:00.000Z',
  }
}

function fundamentals(symbol: string): CandidateFundamentals {
  return {
    symbol,
    company: `${symbol} Corp`,
    sector: 'Technology',
    subIndustry: 'Software',
    marketCap: 10_000_000_000,
    peRatio: 22,
    priceToSales: 4,
    returnOnEquity: 22,
    netMargin: 14,
    debtToEquity: 0.4,
    revenueGrowth: 12,
    earningsGrowth: 15,
    estimateGrowth: 14,
    nextEarningsDate: '2026-08-15',
    profileUrl: `https://example.com/${symbol}`,
    fundamentalsAsOf: '2026-07-29T01:00:00.000Z',
  }
}

const groups: MarketGroupMetric[] = [
  {
    groupType: 'sub_industry',
    label: 'Software',
    sector: 'Technology',
    constituentCount: 8,
    dayReturn: 1,
    return5d: 1,
    return30d: 2,
    return50d: 5,
    return200d: 10,
    return1y: 20,
    vs50DayAverage: 3,
    vs200DayAverage: 8,
  },
  {
    groupType: 'sub_industry',
    label: 'Hardware',
    sector: 'Technology',
    constituentCount: 5,
    dayReturn: 0.5,
    return5d: 0.5,
    return30d: 1,
    return50d: 3,
    return200d: 8,
    return1y: 10,
    vs50DayAverage: 2,
    vs200DayAverage: 5,
  },
]

test('Candidate Scout ranks explainable triggers and preserves six visible dimensions', () => {
  const stocks = [stock('AAA', 'Software', 18), stock('BBB', 'Software', 16), stock('CCC', 'Hardware', 14)]
  const ranked = rankCandidateUniverse(stocks, groups, stocks.map((item) => fundamentals(item.symbol)))
  assert.equal(ranked.length, 3)
  assert.equal(ranked[0]?.dimensions.length, 6)
  assert.ok((ranked[0]?.signals.length ?? 0) >= 2)
  assert.ok(ranked[0]?.signals.every((signal) => signal.materialKey))
})

test('Candidate Scout treats sharp weakness with resilient fundamentals as a dislocation, not an exclusion', () => {
  const falling = {
    ...stock('DROP', 'Software', -15),
    dayReturn: -4.5,
    return5d: -9,
    vs50DayAverage: -8,
    return1y: 12,
  }
  const ranked = rankCandidateUniverse([falling], groups, [fundamentals('DROP')])

  assert.equal(ranked.length, 1)
  assert.ok(ranked[0]?.lanes.includes('dislocation'))
  assert.ok(!ranked[0]?.lanes.includes('leadership'))
  const brief = selectCandidateBriefs(ranked, { tradingDate: '2026-07-30', targetCount: 1 })[0]
  assert.equal(brief?.primaryLane, 'dislocation')
  assert.equal(brief?.selloff.fiveDay, -9)
  assert.match(brief?.entryContext ?? '', /overreaction/)
})

test('accepted theses bypass momentum and quality gates when price weakness requires review', () => {
  const falling = {
    ...stock('THESIS', 'Hardware', -10),
    dayReturn: -2,
    return5d: -5,
    vs50DayAverage: -12,
  }
  const weak = {
    ...fundamentals('THESIS'),
    peRatio: 55,
    returnOnEquity: -2,
    netMargin: -4,
    debtToEquity: 4,
    revenueGrowth: -5,
    earningsGrowth: -8,
    estimateGrowth: -3,
  }
  const tracking = new Map([['THESIS', { acceptedThesis: true, watched: false, owned: false }]])
  const ranked = rankCandidateUniverse([falling], groups, [weak], 200, tracking)

  assert.deepEqual(ranked[0]?.lanes, ['thesis_led'])
  assert.ok(ranked[0]?.signals.some((signal) => signal.kind === 'tracked_thesis_dislocation'))
})

test('multi-lane prefilter retains selloffs and leaders without a negative-return rejection', () => {
  const falling = {
    ...stock('DROP', 'Software', -18),
    dayReturn: -5,
    return5d: -10,
    vs50DayAverage: -11,
  }
  const leader = stock('LEAD', 'Software', 18)
  const selected = multiLanePrefilter([falling, leader], new Map(), 2)

  assert.deepEqual(new Set(selected.map((item) => item.symbol)), new Set(['DROP', 'LEAD']))
})

test('Candidate Scout expands beyond the S&P 500 to watched and owned names', async () => {
  const source = await readFile(new URL('../lib/server/candidate-scout.ts', import.meta.url), 'utf8')
  assert.match(source, /market_watchlist_items/)
  assert.match(source, /manual_positions/)
  assert.match(source, /investment_theses/)
  assert.match(source, /loadExpandedScreenerMetrics/)
  assert.match(source, /multiLanePrefilter/)
})

test('Candidate Scout caps sub-industries and suppresses repeats for five trading days', () => {
  const stocks = [
    stock('AAA', 'Software', 20),
    stock('BBB', 'Software', 19),
    stock('DDD', 'Software', 18),
    stock('CCC', 'Hardware', 17),
  ]
  const ranked = rankCandidateUniverse(stocks, groups, stocks.map((item) => fundamentals(item.symbol)))
  const initial = selectCandidateBriefs(ranked, {
    tradingDate: '2026-07-28',
    targetCount: 4,
    maximumPerSubIndustry: 2,
    generatedAt: '2026-07-29T01:00:00.000Z',
  })
  assert.equal(initial.filter((brief) => brief.subIndustry === 'Software').length, 2)
  assert.equal(initial.length, 3)

  const repeated = selectCandidateBriefs(ranked, {
    tradingDate: '2026-07-30',
    targetCount: 4,
    maximumPerSubIndustry: 2,
    history: initial.map((brief) => ({
      symbol: brief.symbol,
      tradingDate: brief.tradingDate,
      materialKeys: brief.signals.map((signal) => signal.materialKey),
    })),
  })
  assert.ok(repeated.every((brief) => !initial.some((prior) => prior.symbol === brief.symbol)))
})
