import test from 'node:test'
import assert from 'node:assert/strict'

import { normalizeCompanySegmentPeriods } from '../lib/markets/company-segments.ts'

test('normalizes FMP product segment periods without treating metadata as revenue', () => {
  const periods = normalizeCompanySegmentPeriods([
    {
      symbol: 'AMZN',
      fiscalYear: 2024,
      period: 'FY',
      reportedCurrency: 'USD',
      data: {
        AWS: 107_556_000_000,
        advertisingServices: 56_214_000_000,
      },
    },
    {
      symbol: 'AMZN',
      fiscalYear: 2023,
      period: 'FY',
      reportedCurrency: 'USD',
      data: {
        AWS: 90_757_000_000,
        advertisingServices: 46_906_000_000,
      },
    },
  ])

  assert.equal(periods.length, 2)
  assert.equal(periods[0]?.fiscalYear, '2024')
  assert.deepEqual(periods[0]?.values.map((value) => value.label), ['AWS', 'Advertising Services'])
  assert.equal(periods[0]?.values[0]?.revenue, 107_556_000_000)
})

test('normalizes array-shaped segment values and sorts periods newest first', () => {
  const periods = normalizeCompanySegmentPeriods([
    {
      date: '2023-12-31',
      segments: [{ name: 'North America', value: '352,828' }],
    },
    {
      date: '2024-12-31',
      segments: [
        { name: 'North America', value: 387_497 },
        { name: 'International', value: 142_906 },
      ],
    },
  ])

  assert.equal(periods[0]?.date, '2024-12-31')
  assert.equal(periods[0]?.values[1]?.label, 'International')
  assert.equal(periods[1]?.values[0]?.revenue, 352_828)
})
