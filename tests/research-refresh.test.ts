import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyResearchRefresh } from '../lib/markets/research-refresh.ts'
const packet={id:'old',symbol:'TSLA',version:1,generatedAt:'2026-09-30T00:00:00Z',company:{cik:'0001318605',price:200,marketCap:500},financialStatements:{incomeQuarterly:[{date:'2026-06-30',revenue:10}]},estimates:[{date:'2026-12-31',eps:5}],priceHistory:{latestPrice:200},sources:[{id:'capture1',url:'https://sec.gov/filing',asOf:'2026-08-01'}],evidenceQuality:{checkedAt:'2026-09-30',missing:[]}}
const classify=(next:unknown,options={})=>classifyResearchRefresh({priorPacket:packet,packet:next,instrument:'equity',...options})
test('equivalent artifacts and price-only refreshes cannot demand a full report',()=>{
 assert.equal(classify({...packet,id:'new',version:2,generatedAt:'2026-10-01',sources:[{...packet.sources[0],id:'capture2'}]}).kind,'unchanged')
 assert.equal(classify({...packet,company:{...packet.company,price:220,marketCap:550},priceHistory:{latestPrice:220}}).kind,'reprice')
 assert.equal(classify(packet,{priorGeneratedAt:'2026-01-01',now:new Date('2026-10-01')}).kind,'revalidate')
})
test('quarterly results, identity changes and answered gaps reach the appropriate analysis',()=>{
 assert.equal(classify({...packet,financialStatements:{incomeQuarterly:[{date:'2026-09-30',revenue:20}]}}).kind,'full_research')
 assert.equal(classify({...packet,company:{...packet.company,cik:'another-issuer'}}).kind,'full_research')
 assert.equal(classify({...packet,evidenceQuality:{missing:['consensus estimates']}}).kind,'revalidate')
 assert.equal(classify({...packet,researchEvidence:[{title:'A new contextual lead',url:'https://example.com'}]}).kind,'revalidate')
 assert.equal(classify(packet,{onDemand:true}).kind,'full_research')
})
test('fund price-weight changes retain the report while mandate and actual composition changes do not',()=>{
 const fund={symbol:'GRID',issuer:'Issuer',strategy:'Grid infrastructure',holdings:[{symbol:'AAA',identifier:'id',shares:10,weight:0.5,marketValue:100}],priceHistory:{latestPrice:50}}
 const classifyFund=(next:unknown)=>classifyResearchRefresh({priorPacket:fund,packet:next,instrument:'etf'})
 assert.equal(classifyFund({...fund,holdings:[{...fund.holdings[0],weight:0.6,marketValue:120}],priceHistory:{latestPrice:60}}).kind,'reprice')
 assert.equal(classifyFund({...fund,holdings:[{...fund.holdings[0],shares:20}]}).kind,'full_research')
 assert.equal(classifyFund({...fund,strategy:'A new fund mandate'}).kind,'full_research')
})
