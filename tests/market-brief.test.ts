import test from 'node:test'
import assert from 'node:assert/strict'

import { buildMarketDailyBrief, withoutParticipationLanguage } from '../lib/markets/brief.ts'
import { ILLUSTRATIVE_MARKET_OVERVIEW } from '../lib/markets/fixtures.ts'

test('daily market brief prioritizes leadership, weakness, and the decisive watch item', () => {
  const overview = structuredClone(ILLUSTRATIVE_MARKET_OVERVIEW)
  overview.leadership = {
    id: 'leadership-1', tradingDate: '2026-08-10', dataAsOf: '2026-08-10T19:55:00.000Z', generatedAt: '2026-08-10T19:56:00.000Z',
    universeCount: 500, usableCount: 500, freshCount: 500, advancingPercent: 42, above50DayPercent: 61,
    sectors: [{ groupType: 'sector', label: 'Technology', sector: null, constituentCount: 70, dayReturn: 2.1, return5d: 3, return30d: 7, return50d: 8, return200d: 15, return1y: 25, vs50DayAverage: 4, vs200DayAverage: 9 }],
    subIndustries: [{ groupType: 'sub_industry', label: 'Energy Equipment', sector: 'Energy', constituentCount: 20, dayReturn: -2.2, return5d: 1, return30d: 4, return50d: 6, return200d: 8, return1y: 12, vs50DayAverage: 2, vs200DayAverage: 6 }],
    stocks: [],
    leaders: [{ symbol: 'LEAD', company: 'Leader', sector: 'Information Technology', subIndustry: 'Systems Software', price: 100, dayReturn: 4.2, return5d: 2, return30d: 5, return50d: 7, return200d: 12, return1y: 20, vs50DayAverage: 4, vs200DayAverage: 8, relativeVolume: 1.5, observationCount: 220, asOf: '2026-08-10T19:55:00.000Z' }],
    laggards: [{ symbol: 'WEAK', company: 'Weak', sector: 'Energy', subIndustry: 'Energy Equipment', price: 100, dayReturn: -3.1, return5d: -2, return30d: 1, return50d: 3, return200d: 8, return1y: 10, vs50DayAverage: 1, vs200DayAverage: 5, relativeVolume: 1.4, observationCount: 220, asOf: '2026-08-10T19:55:00.000Z' }],
    divergences: [{ id: 'divergence-1', scope: 'near_vs_long_term', symbol: null, groupLabel: 'Semiconductors', nearTermReturn: -3, longTermReturn: 11, spread: -14, summary: 'Semiconductors are cooling against the longer-term trend.' }],
  }

  const brief = buildMarketDailyBrief(overview)

  assert.deepEqual(brief.lines.map((item) => item.label), ['Leadership', 'Weakness', 'Watch'])
  assert.match(brief.lines[0]?.text ?? '', /Technology leads at \+2.1%/)
  assert.match(brief.lines[1]?.text ?? '', /Energy Equipment is the weakest group at -2.2%/)
  assert.equal(brief.lines[2]?.text, 'Semiconductors are cooling against the longer-term trend.')
  assert.doesNotMatch(brief.lines.join(' '), /participation/i)
})

test('overview analysis omits participation diagnostics', () => {
  assert.deepEqual(withoutParticipationLanguage([
    'Downside leadership is concentrated in suppliers.',
    'Breadth resilience remains despite the negative average daily change.',
    'Only 39% of advancing stocks are confirming the move.',
  ]), ['Downside leadership is concentrated in suppliers.'])
})
