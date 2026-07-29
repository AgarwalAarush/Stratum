import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  rankCandidateUniverse,
  selectCandidateBriefs,
  type CandidateFundamentals,
} from '../lib/markets/candidates.ts'
import type { MarketGroupMetric, StockLeadershipMetric } from '../lib/markets/types.ts'

function stock(symbol: string, subIndustry: string, return30d: number): StockLeadershipMetric {
  return {
    symbol,
    company: `${symbol} Corp`,
    sector: 'Technology',
    subIndustry,
    price: 100,
    dayReturn: 1,
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

test('Candidate Scout expands beyond the S&P 500 to watched and owned names', async () => {
  const source = await readFile(new URL('../lib/server/candidate-scout.ts', import.meta.url), 'utf8')
  assert.match(source, /market_watchlist_items/)
  assert.match(source, /manual_positions/)
  assert.match(source, /buildStockLeadershipMetrics/)
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
