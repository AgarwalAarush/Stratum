import test from 'node:test'
import assert from 'node:assert/strict'
import { frozenDecisionMemo, sourceLabel } from '../lib/markets/recommendation-memo.ts'
import type { DecisionContext } from '../lib/markets/recommendations.ts'
test('memo uses only frozen linked evidence, preserves contrary research and omits raw packets',()=>{
 const memo=frozenDecisionMemo({names:[{symbol:'TSLA',portfolioId:'p',currentWeightPct:1.2,causalLinks:['causal:linked'],research:{id:'research',content:{sections:[{title:'Investment thesis',content:'The evidence-backed case'},{title:'Risks',body:'Contrary evidence'},{title:'Other',content:'Irrelevant'}]}}}],evidence:[{id:'causal:linked',kind:'causal_model',value:{title:'Power demand',summary:'Storage demand may grow'}},{id:'causal:other',kind:'causal_model',value:{summary:'Unrelated'}},{id:'packet:raw',kind:'company_packet',value:{secret:'raw payload'}}]} as unknown as DecisionContext)
 assert.equal(memo[0].research.length,2);assert.equal(memo[0].research[1].content,'Contrary evidence');assert.equal(memo[0].world.length,1);assert.equal(memo[0].world[0].cited,false);assert.ok(!JSON.stringify(memo).includes('raw payload'))
 assert.equal(sourceLabel('research:uuid'),'Company research');assert.equal(sourceLabel('portfolio:uuid'),'Portfolio snapshot')
})

test('operating story survives financial-section selection and is tied to the frozen report',()=>{
 const sections=[
  {id:'snapshot',title:'Snapshot',content:'A financial snapshot'},
  {id:'business_model_and_moat',title:'Capabilities',content:'Building a reusable launch vehicle; flight tests are observed.'},
  {id:'market_and_competition',title:'Rivals',content:'Competitor A leads in cadence; this company is differentiated in payload.'},
  {id:'growth_drivers',title:'Execution',content:'Engine qualification is the bottleneck; management targets next year.'},
  {id:'base_case',title:'Base Case',content:'Our operating base case'},
  {id:'valuation',title:'Valuation',content:'Price requires successful execution'},
 ]
 const context={names:[{symbol:'FICT',portfolioId:'p',causalLinks:[],currentWeightPct:1,research:{id:'immutable-report',content:{sections}}}],evidence:[]}
 const before=JSON.stringify(context)
 const memo=frozenDecisionMemo(context as unknown as DecisionContext)[0]
 assert.deepEqual(memo.companyStory.map(s=>s.id),['business_model_and_moat','market_and_competition','growth_drivers'])
 assert.match(memo.companyStory[1].content,/Competitor A leads/)
 assert.equal(memo.researchId,'immutable-report')
 assert.equal(JSON.stringify(context),before)
 assert.ok(memo.research.some(s=>s.content==='Our operating base case'))
})

test('legacy and fund memos preserve their actual story without inventing a manufacturer or missing research',()=>{
 const memo=frozenDecisionMemo({names:[
  {symbol:'FUND',portfolioId:'p',causalLinks:[],research:{content:{sections:[{id:'portfolio_exposure',title:'Portfolio Exposure',content:'Equipment and grid operators'},{id:'top_holdings',title:'Top Holdings',content:'Manufacturer A and network B'}]}}},
  {symbol:'LEGACY',portfolioId:'p',causalLinks:[],research:{content:{sections:[{title:'Business Model & Moat',body:'Actual legacy product evidence'}]}}},
  {symbol:'NONE',portfolioId:'p',causalLinks:[],research:null},
 ],evidence:[]} as unknown as DecisionContext)
 assert.deepEqual(memo[0].companyStory.map(s=>s.title),['What the fund owns','The businesses behind the exposure'])
 assert.equal(memo[1].companyStory[0].content,'Actual legacy product evidence')
 assert.deepEqual(memo[2].companyStory,[])
})

test('frozen memo separates supported ownership from incomplete new-capital evidence',()=>{
 const gap={id:'topic:new-product-economics',description:'New product margins are unavailable',availability:'not_disclosed',affectedActions:['buy','add'],resolution:'Reassess if product margins are disclosed.'}
 const dimension=(value:string)=>({value,reason:'Captured operations support this assessment.',sourceIds:['issuer'],changeConditions:['Reassess after the next quarterly disclosure.']})
 const content={researchContractVersion:1,advice:{version:1,businessView:dimension('constructive'),evidenceSufficiency:dimension('insufficient'),newEntryStance:dimension('wait'),existingPositionStance:dimension('retain')},evidenceAssessment:{version:1,gaps:[gap],actionSupport:[{action:'hold',reason:'Established operations support ownership independently of the new product.',sourceIds:['issuer'],gapIds:[gap.id],reversalConditions:['Reduce if established operating cash flow deteriorates.']}]}}
 const memo=frozenDecisionMemo({names:[{symbol:'FICT',portfolioId:'p',causalLinks:[],research:{id:'frozen',status:'complete',content}}],evidence:[]} as unknown as DecisionContext)[0]
 assert.equal(memo.assessment.advice?.existingPositionStance.value,'retain')
 assert.equal(memo.assessment.advice?.newEntryStance.value,'wait')
 assert.equal(memo.assessment.status,'complete')
 assert.deepEqual(memo.assessment.evidenceAssessment?.gaps[0].affectedActions,['buy','add'])
 assert.equal(memo.researchId,'frozen')
})
