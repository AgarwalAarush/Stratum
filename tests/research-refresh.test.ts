import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyResearchRefresh } from '../lib/markets/research-refresh.ts'
import { currentResearchContract } from './fixtures/current-research-contract.ts'
const packet={id:'old',symbol:'TSLA',version:1,generatedAt:'2026-09-30T00:00:00Z',company:{cik:'0001318605',price:200,marketCap:500},financialStatements:{incomeQuarterly:[{date:'2026-06-30',revenue:10}]},estimates:[{date:'2026-12-31',eps:5}],priceHistory:{latestPrice:200},sources:[{id:'capture1',url:'https://sec.gov/filing',asOf:'2026-08-01'}],evidenceQuality:{checkedAt:'2026-09-30',missing:[]}}
const priorResearch=currentResearchContract('capture1')
const classify=(next:unknown,options={})=>classifyResearchRefresh({priorPacket:packet,packet:next,priorResearch,instrument:'equity',...options})
test('equivalent artifacts and price-only refreshes cannot demand a full report',()=>{
 assert.equal(classify({...packet,id:'new',version:2,generatedAt:'2026-10-01'}).kind,'unchanged')
 assert.equal(classify({...packet,company:{...packet.company,price:220,marketCap:550},priceHistory:{latestPrice:220}}).kind,'reprice')
 assert.equal(classify(packet,{priorGeneratedAt:'2026-01-01',now:new Date('2026-10-01')}).kind,'revalidate')
})
test('quarterly results, identity changes and answered gaps reach the appropriate analysis',()=>{
 assert.equal(classify({...packet,financialStatements:{incomeQuarterly:[{date:'2026-09-30',revenue:20}]}}).kind,'full_research')
 assert.equal(classify({...packet,company:{...packet.company,cik:'another-issuer'}}).kind,'full_research')
 assert.equal(classify({...packet,evidenceQuality:{missing:['consensus estimates']}}).kind,'full_research')
 assert.equal(classify({...packet,researchEvidence:[{title:'A new contextual lead',url:'https://example.com'}]}).kind,'revalidate')
 assert.equal(classify(packet,{onDemand:true}).kind,'full_research')
})
test('new or resolved packet gaps require a new assessment before a report can be retained',()=>{
 const gap={id:'packet:cash flow',description:'The cash-flow history could not be retrieved.',availability:'retrieval_failed' as const,affectedActions:['buy','add'] as Array<'buy'|'add'>,resolution:'Retrieve the issuer cash-flow statement.'}
 const baseline={...packet,evidenceQuality:{missing:['cash flow']}}
 const report={...priorResearch,evidenceAssessment:{...priorResearch.evidenceAssessment,gaps:[gap],actionSupport:priorResearch.evidenceAssessment.actionSupport.map(s=>({...s,gapIds:[gap.id]}))}}
 assert.equal(classifyResearchRefresh({priorPacket:baseline,packet:baseline,priorResearch:report,instrument:'equity'}).kind,'unchanged')
 const added=classify({...packet,evidenceQuality:{missing:['cash flow']}},{forecastChanged:true})
 assert.equal(added.kind,'full_research');assert.match(added.reasons[0],/gaps changed/)
 const resolved=classifyResearchRefresh({priorPacket:baseline,packet,priorResearch:report,instrument:'equity',conditionsChanged:true})
 assert.equal(resolved.kind,'full_research');assert.match(resolved.reasons[0],/gaps changed/)
})
test('a report loses cheap reuse when its supporting source disappears or becomes unreadable',()=>{
 assert.equal(classify({...packet,sources:[]}).kind,'full_research')
 assert.equal(classify({...packet,sources:[{...packet.sources[0],id:'replacement'}]}).kind,'full_research')
 const result=classify({...packet,filings:[],events:[],researchDocuments:[{sourceId:'capture1',extractionStatus:'failed'}]})
 assert.equal(result.kind,'full_research');assert.match(result.reasons[0],/missing or unreadable/)
})
test('fund price-weight changes retain the report while mandate and actual composition changes do not',()=>{
 const fund={symbol:'GRID',issuer:'Issuer',strategy:'Grid infrastructure',holdings:[{symbol:'AAA',identifier:'id',shares:10,weight:0.5,marketValue:100}],priceHistory:{latestPrice:50}}
 const classifyFund=(next:unknown)=>classifyResearchRefresh({priorPacket:fund,packet:next,priorResearch,instrument:'etf'})
 assert.equal(classifyFund({...fund,holdings:[{...fund.holdings[0],weight:0.6,marketValue:120}],priceHistory:{latestPrice:60}}).kind,'reprice')
 assert.equal(classifyFund({...fund,holdings:[{...fund.holdings[0],shares:20}]}).kind,'full_research')
 assert.equal(classifyFund({...fund,strategy:'A new fund mandate'}).kind,'full_research')
})
test('a missing, obsolete or malformed report contract forces full research before every cheap refresh',()=>{
 for(const prior of [undefined,{}, {...priorResearch,researchContractVersion:0}, {...priorResearch,evidenceAssessment:null}, {...priorResearch,advice:null}, {...priorResearch,sourceIds:['fabricated']}]) {
  for(const [next,options] of [[packet,{}],[{...packet,priceHistory:{latestPrice:220}},{}],[packet,{forecastChanged:true}],[packet,{conditionsChanged:true}]] as const) {
   const result=classify(next,{...options,priorResearch:prior})
   assert.equal(result.kind,'full_research')
   assert.match(result.reasons[0],/contract 1/)
  }
 }
 assert.equal(classify(packet,{forecastChanged:true}).kind,'revalidate')
})
