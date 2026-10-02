import test from 'node:test'
import assert from 'node:assert/strict'
import { frozenDecisionMemo, sourceLabel } from '../lib/markets/recommendation-memo.ts'
import type { DecisionContext } from '../lib/markets/recommendations.ts'
test('memo uses only frozen linked evidence, preserves contrary research and omits raw packets',()=>{
 const memo=frozenDecisionMemo({names:[{symbol:'TSLA',portfolioId:'p',currentWeightPct:1.2,causalLinks:['causal:linked'],research:{id:'research',content:{sections:[{title:'Investment thesis',content:'The evidence-backed case'},{title:'Risks',body:'Contrary evidence'},{title:'Other',content:'Irrelevant'}]}}}],evidence:[{id:'causal:linked',kind:'causal_model',value:{title:'Power demand',summary:'Storage demand may grow'}},{id:'causal:other',kind:'causal_model',value:{summary:'Unrelated'}},{id:'packet:raw',kind:'company_packet',value:{secret:'raw payload'}}]} as unknown as DecisionContext)
 assert.equal(memo[0].research.length,2);assert.equal(memo[0].research[1].content,'Contrary evidence');assert.equal(memo[0].world.length,1);assert.equal(memo[0].world[0].cited,false);assert.ok(!JSON.stringify(memo).includes('raw payload'))
 assert.equal(sourceLabel('research:uuid'),'Company research');assert.equal(sourceLabel('portfolio:uuid'),'Portfolio snapshot')
})
