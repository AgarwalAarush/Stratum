import test from 'node:test'
import assert from 'node:assert/strict'
import { abstention, validateGeneratedBatch, type DecisionContext, type DecisionName } from '../lib/markets/recommendations.ts'

const names: DecisionName[] = ['AAA','BBB'].map(symbol => ({symbol,portfolioId:'portfolio',securityId:symbol,owned:false,quantity:0,currentWeightPct:0,portfolioValue:1000,cash:100,quote:null,research:null,thesis:null,sources:[],gaps:[],causalLinks:[],selectionReason:'watchlist'}))
const context: DecisionContext = {id:'context',ownerId:'owner',date:'2026-09-07',cutoff:'2026-09-07T14:00:00Z',policy:'v1',codeVersion:'test',portfolio:[],names,evidence:[],world:[],market:null,gaps:[],universe:[]}
const proposals = () => names.map(n => ({...abstention(n,context,'Screening investigation is needed'),action:'watch'}))

test('one missing exit abstains only that name, preserves rejected output and publishes no invented repair', () => {
  const values=proposals();values[0].action='buy';values[0].exit='N/A'
  const result=validateGeneratedBatch(values,context)
  assert.equal(result.recommendations[0].action,'no_trade')
  assert.equal(result.recommendations[0].entry.targetWeightPct,null)
  assert.match(result.recommendations[0].reason,/Missing exit/)
  assert.match(result.recommendations[0].gateReasons.join(' '),/Missing exit/)
  assert.equal(result.recommendations[1].action,'watch')
  assert.equal(result.failures.length,1)
  assert.deepEqual(result.failures[0].rejected,values[0])
  assert.equal(values[0].action,'buy')
})
test('unknown citations fail closed per name while missing or ambiguous coverage fails the entire batch', () => {
  const values=proposals();values[0].sourceIds=['invented']
  assert.equal(validateGeneratedBatch(values,context).recommendations[0].action,'no_trade')
  assert.throws(()=>validateGeneratedBatch(values.slice(0,1),context),/cover every/)
  assert.throws(()=>validateGeneratedBatch([values[0],values[0]],context),/unknown or duplicate/)
  assert.throws(()=>validateGeneratedBatch([{...values[0],symbol:'OUTSIDE'},values[1]],context),/unknown or duplicate/)
})
