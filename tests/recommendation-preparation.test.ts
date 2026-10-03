import { currentAdvice } from './fixtures/research-advice-v2.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import { recommendationResearchTargets, dependencyReadiness, parseRecommendationDependencies } from '../lib/markets/recommendation-preparation.ts'
import type { DecisionContext } from '../lib/markets/recommendations.ts'

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
