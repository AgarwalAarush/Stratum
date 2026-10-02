import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {recommendationCriticSchema, RECOMMENDATION_REVIEW_RULES} from '../lib/markets/recommendation-critic.ts'

const base=JSON.parse(readFileSync('schemas/recommendation-critic.schema.json','utf8'))
test('review schema permits only actual portfolio/security pairs and preserves the checked-in contract',()=>{
  const before=JSON.stringify(base)
  const schema=recommendationCriticSchema(base,[{portfolioId:'account-b',symbol:'BBB'},{portfolioId:'account-a',symbol:'AAA'},{portfolioId:'account-a',symbol:'CCC'}])
  const branches=(schema.properties.blocks.items as unknown as {anyOf:Array<{properties:{portfolioId:{enum:string[]};symbol:{enum:string[]}};required:string[];additionalProperties:boolean}>}).anyOf
  const permits=(portfolioId:string,symbol:string)=>branches.some(b=>b.properties.portfolioId.enum.includes(portfolioId)&&b.properties.symbol.enum.includes(symbol))
  assert.equal(permits('account-a','AAA'),true)
  assert.equal(permits('account-b','BBB'),true)
  assert.equal(permits('account-b','AAA'),false)
  assert.equal(permits('Portfolio Name','AAA'),false)
  assert.equal(permits('account-a','*'),false)
  for(const b of branches){assert.equal(b.additionalProperties,false);assert.deepEqual(b.required,['symbol','portfolioId','reason'])}
  assert.equal(JSON.stringify(base),before)
  assert.throws(()=>recommendationCriticSchema(base,[]))
})

// The production critic rejected every valid decision after research-only
// output instructions were accidentally applied to recommendation objects.
test('review instructions distinguish frozen research advice from the decision schema',()=>{
  const schema=JSON.parse(readFileSync('schemas/daily-recommendations.schema.json','utf8'))
  const decision=schema.properties.recommendations.items
  assert.equal(decision.properties.advice,undefined)
  for(const field of ['thesisQuality','valuation','timing','portfolioFit'])assert.equal(decision.properties.dimensions.properties[field].type,'string')
  assert.match(RECOMMENDATION_REVIEW_RULES,/Recommendation dimensions are narrative strings/)
  assert.match(RECOMMENDATION_REVIEW_RULES,/Do not require research advice fields on recommendation objects/)
  assert.ok(!RECOMMENDATION_REVIEW_RULES.includes('Return advice.version'))
  assert.match(RECOMMENDATION_REVIEW_RULES,/Reject Buy\/Add with unresolved decisive coverage/)
})
