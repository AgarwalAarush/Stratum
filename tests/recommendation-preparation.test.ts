import { currentAdvice } from './fixtures/research-advice-v2.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import { recommendationResearchTargets, recommendationNeedsReview, dependencyReadiness, parseRecommendationDependencies } from '../lib/markets/recommendation-preparation.ts'
import type { DecisionContext } from '../lib/markets/recommendations.ts'

test('batch evidence gaps cannot suppress independently supported ownership review', () => {
  const advice = currentAdvice()
  advice.evidenceSufficiency.value = 'insufficient'
  const name = {owned:true,gaps:['Missing company evidence: cash flow'],research:{id:'current',content:{advice}}}
  assert.equal(recommendationNeedsReview(name),true)
  assert.equal(recommendationNeedsReview({...name,research:{id:'legacy',content:{formalRating:'SELL'}}}),false)
  assert.equal(recommendationNeedsReview({...name,research:undefined,gaps:[]}),true)
  for(const action of ['buy','add','hold','trim','sell'] as const) advice.decisionSupport!.actionSupport[action].status='unresolved'
  advice.existingPositionStance.value='undetermined';advice.newEntryStance.value='wait'
  assert.equal(recommendationNeedsReview(name),false)
})

test('repairs each instrument once across accounts, without retrying an unresolved identity or cash gap as research', () => {
  const name = {symbol:'GRID',securityId:'grid',gaps:['ETF holdings are older than seven days or undated'],instrumentType:'etf',research:{id:'old'}}
  const context = {names:[name,{...name,portfolioId:'another'},
    {symbol:'PIKA',securityId:'unresolved:PIKA',gaps:['Research missing']},
    {symbol:'ABC',research:{content:{advice:currentAdvice()}},securityId:'abc',gaps:[],entryGaps:['Cash availability needs a current owner confirmation']}]} as unknown as DecisionContext
  assert.deepEqual(recommendationResearchTargets(context),[{symbol:'GRID',instrumentType:'etf',researchId:'old'}])
})

test('a new edition waits for every dependency, then retains failed-source gaps instead of waiting forever', () => {
  assert.equal(dependencyReadiness(['a','b'],[{id:'a',status:'succeeded'},{id:'b',status:'running'}]),false)
  assert.equal(dependencyReadiness(['a','b'],[{id:'a',status:'succeeded'},{id:'b',status:'queued'}]),false)
  assert.equal(dependencyReadiness(['a','b'],[{id:'a',status:'succeeded'},{id:'b',status:'failed'}]),true)
  assert.throws(()=>dependencyReadiness(['a','b'],[{id:'a',status:'succeeded'}]),/missing/)
  const id='00000000-0000-4000-8000-000000000001'
  assert.deepEqual(parseRecommendationDependencies({dependencyJobIds:[id,id]}),[id])
  assert.throws(()=>parseRecommendationDependencies({dependencyJobIds:['missing']}),/Invalid/)
})
