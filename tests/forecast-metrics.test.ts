import test from 'node:test'
import assert from 'node:assert/strict'
import { companyForecastObservations } from '../lib/markets/forecast-metrics.ts'
import { resolveNumericForecast } from '../lib/markets/investment-learning.ts'

test('quarterly forecasts resolve exact units and periods from the first captured packet', () => {
  const metric = 'FMP:incomeQuarterly:revenue'
  const packet = (id: string, date: string, value: number) => ({ id, generated_at: date, packet: {
    symbol: 'TEST', financialStatements: { incomeQuarterly: [{ date: '2026-09-30', revenue: value, reportedCurrency: 'USD' }] },
  } })
  const observations = companyForecastObservations(metric, [packet('first', '2026-10-20', 150), packet('revision', '2026-11-10', 90)])
  const forecast = { resolutionSource: 'FMP:incomeQuarterly:revenue', metric, issuedAt: '2026-10-01', observationPeriod: '2026-09-30', unit: 'USD', threshold: 100, operator: 'gt' as const, deadline: '2026-10-31' }
  const result = resolveNumericForecast(forecast, observations, '2026-11-20')
  assert.equal(result.outcome, true)
  assert.equal(result.observation?.id, 'first')
  assert.equal(resolveNumericForecast({ ...forecast, unit: 'EUR' }, observations, '2026-11-20').outcome, null)
  assert.equal(resolveNumericForecast({ ...forecast, observationPeriod: '2026-12-31' }, observations, '2027-01-31').outcome, null)
  assert.equal(resolveNumericForecast(forecast, observations, '2026-10-25').status, 'not_yet_due')
  assert.equal(resolveNumericForecast(forecast, [ { ...observations[0], availableAt: '2026-09-29' } ], '2026-11-20').outcome, null)
})

test('unknown metrics and null statement values cannot turn into economic outcomes', () => {
  const packet = { id: 'one', generated_at: '2026-10-20', packet: { financialStatements: { incomeQuarterly: [{ date: '2026-09-30', revenue: null, reportedCurrency: 'USD' }] } } }
  assert.deepEqual(companyForecastObservations('management supply-demand assessment', [packet]), [])
  assert.deepEqual(companyForecastObservations('FMP:incomeQuarterly:revenue', [packet]), [])
})

test('ticker reuse cannot resolve a prior issuer’s economic claim',()=>{
  const packet={id:'different-company',generated_at:'2026-10-20',packet:{symbol:'ABC',company:{cik:'999'},financialStatements:{incomeQuarterly:[{date:'2026-09-30',revenue:500,reportedCurrency:'USD'}]}}}
  assert.deepEqual(companyForecastObservations('FMP:incomeQuarterly:revenue',[packet],'000001'),[])
})
