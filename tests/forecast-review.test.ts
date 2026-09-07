import test from 'node:test'
import assert from 'node:assert/strict'
import { forecastsAreApproved, reviewedForecasts } from '../lib/markets/forecast-review.ts'
import type { Recommendation } from '../lib/markets/recommendations.ts'
import { adjudicateRecommendationForecast, reviewRecommendationCohort } from '../lib/server/recommendation-outcomes.ts'

test('blocked forecasts stay in the original record but cannot enter approved projections', () => {
  const original = { action: 'no_trade', gateReasons: ['Unsupported forecast'], forecasts: [{probability: 0.9}] } as Recommendation
  const projected = reviewedForecasts(original)
  assert.deepEqual(projected.forecasts, [])
  assert.equal(original.forecasts.length, 1)
  assert.equal(forecastsAreApproved(original), false)
  assert.equal(forecastsAreApproved(null), false)
  assert.equal(forecastsAreApproved({...original, gateReasons: []}), true, 'A no-trade action alone does not invalidate economic evidence')
  assert.equal(forecastsAreApproved({...original, action: 'hold'}), false, 'Legacy content is gated regardless of its action label')
})

test('legacy rejected forecasts are excluded from calibration and owner adjudication, with all decisions retained', async () => {
  process.env.SUPABASE_URL = 'http://127.0.0.1:54321'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'fixture-key'
  const originalFetch = globalThis.fetch
  const blocked = {action: 'no_trade', forecasts: [{probability: 0.9}], gateReasons: ['Critic rejected evidence']}
  const accepted = {action: 'watch', forecasts: [{probability: 0.7}], gateReasons: []}
  const writes: string[] = []
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input)), table = url.pathname.split('/').at(-1)
    if (init?.method === 'POST') { writes.push(String(table)); return new Response(null,{status:201}) }
    let data: unknown = []
    if (table === 'recommendation_versions') data = [
      {id:'blocked',episode_id:'bad',action:'no_trade',issued_at:'2026-09-01',content:blocked},
      {id:'accepted',episode_id:'good',action:'watch',issued_at:'2026-09-01',content:accepted},
    ]
    if (table === 'recommendation_forecasts') data = url.searchParams.has('id')
      ? {id:'f-bad',deadline:'2026-09-02',recommendation_versions:{content:blocked}}
      : [{recommendation_id:'blocked',ordinal:0,probability:0.9},{recommendation_id:'accepted',ordinal:0,probability:0.7}]
    if (table === 'recommendation_evaluations') data = ['blocked','accepted'].map(id=>({recommendation_id:id,kind:'thesis',horizon:'0',content:{outcome:true}}))
    return new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}})
  }
  try {
    const cohort = await reviewRecommendationCohort('owner',new Date('2026-10-01'))
    assert.equal(cohort.denominator,2)
    assert.deepEqual(cohort.forecastReview,{policy:'reviewed-forecasts-v2',total:2,eligible:1,excluded:1})
    assert.equal(cohort.calibration.independentEpisodes,1)
    await assert.rejects(adjudicateRecommendationForecast('owner',{
      forecastId:'f-bad',observedValue:100,rationale:'A sufficiently detailed observed outcome',evidence:[{url:'https://example.org',availableAt:'2026-09-03'}],
    },new Date('2026-10-01')),/withheld by decision review/)
    assert.deepEqual(writes,['recommendation_cohort_reviews'])
  } finally { globalThis.fetch = originalFetch }
})
