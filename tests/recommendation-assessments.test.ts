import test from 'node:test'
import assert from 'node:assert/strict'
import { assessmentKey, combineFrozenAssessments, partitionAssessmentNames, RECOMMENDATION_ASSESSMENT_VERSION, selectAssessmentNames, type FrozenAssessment } from '../lib/markets/recommendation-assessments.ts'
import { abstention, gateRecommendation, type DecisionContext, type DecisionName, type Recommendation } from '../lib/markets/recommendations.ts'

const name:DecisionName={symbol:'AAA',securityId:'asset',portfolioId:'account',owned:false,quantity:0,currentWeightPct:0,portfolioValue:10000,cash:1000,
  quote:{price:100,asOf:'2026-10-02T20:00:00Z',feed:'iex'},research:{id:'report'},thesis:{status:'accepted'},sector:'Technology',averageDollarVolume:1000000,sources:['s'],gaps:[],causalLinks:[],selectionReason:'watchlist'}
const context:DecisionContext={id:'frozen',ownerId:'owner',date:'2026-10-03',cutoff:'2026-10-03T14:00:00Z',policy:'v1',codeVersion:'code',portfolio:[],names:[name],evidence:[{id:'s',kind:'primary',url:null,asOf:'2026-10-02',availableAt:'2026-10-02',retrievedAt:'2026-10-03',hash:'source',feed:null,value:{revenue:123}}],world:[],market:null,gaps:[],universe:[]}
const result=(c:DecisionContext,keys=c.names.map(assessmentKey)):FrozenAssessment=>({kind:RECOMMENDATION_ASSESSMENT_VERSION,manifestId:c.id,frozenHash:'hash',keys,
  recommendations:keys.map(key=>abstention(c.names.find(n=>assessmentKey(n)===key)!,c,'Precise unresolved research question')),summary:'Ownership conclusions',metadata:{critic:{model:'gpt-6.1-sol',status:'succeeded'},reviewedKeys:keys,criticBlocks:[]}})

test('51 account/security pairs partition without omission, account collapse, mutation or oversized assessments',()=>{
  const names=Array.from({length:51},(_,i)=>({...name,symbol:`S${String(Math.floor(i/2)).padStart(2,'0')}`,portfolioId:`account-${i%2}`}))
  const before=structuredClone(names),batches=partitionAssessmentNames(names)
  assert.deepEqual(batches.map(b=>b.length),[8,8,8,8,8,8,3])
  assert.equal(new Set(batches.flat().map(assessmentKey)).size,51)
  assert.deepEqual(names,before)
  assert.deepEqual(partitionAssessmentNames([...names].reverse()),batches)
  assert.throws(()=>partitionAssessmentNames([name,name]),/Duplicate/)
})

test('assessment selection rejects another account, duplicates and oversized work',()=>{
  assert.deepEqual(selectAssessmentNames(context,['account:AAA']),[name])
  for(const keys of [['foreign:AAA'],['account:AAA','account:AAA'],[],Array(9).fill('account:AAA')]) assert.throws(()=>selectAssessmentNames(context,keys))
})

test('publication rejects omitted, duplicate, differently frozen or unreviewed results',()=>{
  const c={...context,names:[name,{...name,symbol:'BBB'}]}
  const first=result(c,['account:AAA']),second=result(c,['account:BBB'])
  assert.throws(()=>combineFrozenAssessments(c,'hash',[],[first]),/omit/)
  assert.throws(()=>combineFrozenAssessments(c,'hash',[],[first,first,second]),/overlap/)
  assert.throws(()=>combineFrozenAssessments(c,'hash',[],[{...first,frozenHash:'changed'},second]),/different frozen/)
  assert.throws(()=>combineFrozenAssessments(c,'hash',[],[{...first,manifestId:'other-cutoff'},second]),/different frozen/)
  assert.throws(()=>combineFrozenAssessments(c,'hash',[],[{...first,metadata:{critic:{model:'gpt-6.1-sol',status:'failed'},reviewedKeys:first.keys}},second]),/independent review/)
  assert.throws(()=>combineFrozenAssessments(c,'hash',[],[{...first,metadata:{critic:{model:'gpt-6.1-sol',status:'succeeded'},reviewedKeys:['foreign:AAA']}},second]),/independent review/)
  assert.equal(combineFrozenAssessments(c,'hash',[],[second,first]).length,2)
})

test('independently reviewed parts cannot each spend the whole account cash',()=>{
  const c={...context,names:[name,{...name,symbol:'BBB'}]}
  const parts=c.names.map(n=>{
    const r=result(c,[assessmentKey(n)])
    const rec:Recommendation={...r.recommendations[0],action:'buy',sourceIds:['s'],gateReasons:[],entry:{condition:'At or below cited ceiling',maxPrice:105,targetWeightPct:6},
      forecasts:[{proposition:'Reported revenue exceeds the threshold',metric:'revenue',operator:'gt',threshold:100,probability:0.7,deadline:'2026-12-31T00:00:00Z',confirmation:'Reported revenue exceeds threshold',invalidation:'Reported revenue misses threshold',sourceIds:['s']}]}
    assert.equal(gateRecommendation(rec,{...c,names:[n]}).action,'buy')
    return {...r,recommendations:[rec]}
  })
  const combined=combineFrozenAssessments(c,'hash',[],parts)
  assert.ok(combined.every(r=>r.action==='no_trade'))
  assert.ok(combined.every(r=>r.gateReasons.includes('Combined recommendations exceed available cash')))
})

test('persisted critic blocks cannot silently become accepted actions',()=>{
  const r=result(context)
  r.metadata.criticBlocks=[{portfolioId:'account',symbol:'AAA',reason:'Unsupported scenario'}]
  r.recommendations[0].action='research'
  assert.throws(()=>combineFrozenAssessments(context,'hash',[],[r]),/Independently blocked/)
  r.recommendations[0].action='no_trade'
  r.recommendations[0].gateReasons=['Unsupported scenario']
  assert.equal(combineFrozenAssessments(context,'hash',[],[r])[0].action,'no_trade')
})
