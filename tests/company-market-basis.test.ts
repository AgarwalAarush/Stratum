import test from 'node:test'
import assert from 'node:assert/strict'
import { selectCompanyMarketBasis } from '../lib/markets/company-market-basis.ts'
import { needsDecisionResearchRefresh } from '../lib/markets/decision-admission.ts'

const leadership = {price: 100, asOf: '2026-08-18T20:00:00Z', return30d: 10, return1y: 25, vs50DayAverage: 5, vs200DayAverage: 8, sector: 'Technology', subIndustry: 'Semiconductors'}
const viewer = {price: 120, dataAsOf: '2026-09-04T20:00:00Z', sector: 'Classification pending', subIndustry: 'Classification pending'}
const now = new Date('2026-09-07T14:00:00Z')

test('daily evidence repair includes stale entry assumptions but not unrelated portfolio gaps', () => {
  assert.equal(needsDecisionResearchRefresh({gaps: [], entryGaps: ['Research entry assumptions use stale price evidence; refresh research']}), true)
  assert.equal(needsDecisionResearchRefresh({gaps: ['Research missing or older than 35 days']}), true)
  assert.equal(needsDecisionResearchRefresh({gaps: ['Current portfolio capture needs verification']}), false)
  assert.equal(needsDecisionResearchRefresh({gaps: [], entryGaps: []}), false)
})

test('fresh quote supersedes stale leadership without relabeling old technicals', () => {
  const result = selectCompanyMarketBasis(leadership, viewer, now)
  assert.equal(result.price, 120)
  assert.equal(result.asOf, viewer.dataAsOf)
  assert.equal(result.return30d, null)
  assert.equal(result.vs200DayAverage, null)
  assert.equal(result.technicalAsOf, null)
  assert.equal(result.sector, 'Technology')
})
test('same-session technicals retain their own source timestamp', () => {
  const asOf = '2026-09-04T19:59:00Z'
  const result = selectCompanyMarketBasis({...leadership, asOf}, viewer, now)
  assert.equal(result.price, 120)
  assert.equal(result.return30d, 10)
  assert.equal(result.technicalAsOf, asOf)
})
test('future, missing, nonfinite and older quotes never replace valid leadership', () => {
  for (const invalid of [{...viewer, dataAsOf: 'invalid'}, {...viewer, dataAsOf: '2026-10-01'}, {...viewer, price: NaN}, {...viewer, price: null}, {...viewer, dataAsOf: '2026-08-01'}]) {
    assert.equal(selectCompanyMarketBasis(leadership, invalid, now).price, 100)
  }
  assert.throws(() => selectCompanyMarketBasis(null, {...viewer, price: null}, now), /No valid dated/)
})
