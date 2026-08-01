import test from 'node:test'
import assert from 'node:assert/strict'

import { buildMarketAttention, buildMarketCheckpoints } from '../lib/markets/attention.ts'
import type { MarketLeadershipSnapshot } from '../lib/markets/types.ts'

const stock = (symbol: string, dayReturn: number) => ({
  symbol,
  company: `${symbol} Inc.`,
  sector: 'Information Technology',
  subIndustry: 'Semiconductors',
  price: 100,
  dayReturn,
  return5d: 2,
  return30d: 5,
  return50d: 6,
  return200d: 12,
  return1y: 20,
  vs50DayAverage: 4,
  vs200DayAverage: 8,
  relativeVolume: 2.4,
  observationCount: 220,
  asOf: '2026-07-31T20:00:00.000Z',
})

const snapshot: MarketLeadershipSnapshot = {
  id: 'leadership-1',
  tradingDate: '2026-07-31',
  dataAsOf: '2026-07-31T20:00:00.000Z',
  generatedAt: '2026-07-31T20:01:00.000Z',
  universeCount: 500,
  usableCount: 500,
  freshCount: 480,
  advancingPercent: 42,
  above50DayPercent: 61,
  sectors: [{ groupType: 'sector', label: 'Information Technology', sector: null, constituentCount: 70, dayReturn: 2.1, return5d: 3, return30d: 7, return50d: 8, return200d: 15, return1y: 25, vs50DayAverage: 4, vs200DayAverage: 9 }],
  subIndustries: [],
  stocks: [stock('INTC', 6.1), stock('XYZ', -4.2)],
  leaders: [stock('INTC', 6.1)],
  laggards: [stock('XYZ', -4.2)],
  divergences: [{ id: 'semis', scope: 'near_vs_long_term', symbol: null, groupLabel: 'Semiconductors', nearTermReturn: -2, longTermReturn: 20, spread: -22, summary: 'Semiconductors are cooling against their longer-term trend.' }],
}

test('market attention surfaces participation, names, group motion, and a divergence without claiming a cause', () => {
  const items = buildMarketAttention(snapshot)

  assert.equal(items[0]?.id, 'participation')
  assert.ok(items.some((item) => item.id === 'leading-INTC'))
  assert.ok(items.some((item) => item.id === 'falling-XYZ'))
  assert.ok(items.some((item) => item.id === 'group-sector-Information Technology'))
  assert.ok(items.some((item) => item.id === 'divergence-semis'))
  assert.match(items.find((item) => item.id === 'leading-INTC')?.detail ?? '', /relative volume/)
})

test('market checkpoints make participation, dispersion, and coverage explicit', () => {
  const checkpoints = buildMarketCheckpoints(snapshot)

  assert.deepEqual(checkpoints.map((item) => item.id), ['participation', 'dispersion', 'coverage'])
  assert.equal(checkpoints[0]?.value, '42% advancing')
  assert.equal(checkpoints[1]?.value, '+10.3pp')
  assert.equal(checkpoints[2]?.value, '500/500')
})
