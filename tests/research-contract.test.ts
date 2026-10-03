import test from 'node:test'
import assert from 'node:assert/strict'
import { currentAdvice } from './fixtures/research-advice-v2.ts'
import { validateResearchAdvice } from '../lib/markets/research-advice.ts'
import { hasCurrentResearchContract,validatePacketDecisionSupport,type EvidenceGap } from '../lib/markets/research-contract.ts'
import { gateRecommendation,validateRecommendation,abstention,type DecisionContext,type DecisionName } from '../lib/markets/recommendations.ts'
import { classifyResearchRefresh } from '../lib/markets/research-refresh.ts'
import { recommendationResearchTargets } from '../lib/markets/recommendation-preparation.ts'
const gap:EvidenceGap={id:'cash-flow',question:'Cash flow detail is absent from the captured evidence.',kind:'missing_fact',dataKeys:['cash flow'],blockingActions:['buy','add'],sourceIds:['s'],followUp:{trigger:'The next audited cash flow statement.',nextCheckAt:null}}
function fixture(){
 const advice=currentAdvice([gap]);advice.newEntryStance.value='wait';advice.evidenceSufficiency.value='insufficient'
 const name:DecisionName={symbol:'ABC',securityId:'security',portfolioId:'p',owned:true,quantity:1,currentWeightPct:5,portfolioValue:10000,cash:1000,quote:{price:100,asOf:'2026-10-02T20:00:00Z',feed:'iex'},research:{id:'r',content:{formalRating:'NOT_RATED',advice}},thesis:{status:'accepted'},sector:'Technology',averageDollarVolume:1000000,sources:['s'],gaps:['Missing company evidence: cash flow'],causalLinks:[],selectionReason:'owned'}
 const context:DecisionContext={id:'m',ownerId:'owner',date:'2026-10-03',cutoff:'2026-10-03T07:00:00Z',policy:'prospective-v1.7',codeVersion:'test',portfolio:[],names:[name],evidence:[{id:'s',kind:'primary',value:{},url:'https://example.com',asOf:'2026-10-02',availableAt:'2026-10-02',retrievedAt:'2026-10-02',feed:null,hash:'h'}],world:[],market:null,gaps:[],universe:[]}
 return {name,context,rec:{...abstention(name,context,'Supported ownership decision'),action:'hold' as const,sourceIds:['s'],gateReasons:[],entry:{trigger:'manual_condition' as const,condition:'Retain supported current exposure',maxPrice:null,targetWeightPct:5}}}
}
test('missing cash flow can block new risk without erasing cited ownership support',()=>{const {name,context,rec}=fixture();assert.doesNotThrow(()=>validateResearchAdvice((name.research!.content as {advice:unknown}).advice,['s']));assert.equal(gateRecommendation(rec,context).action,'hold');const result=gateRecommendation({...rec,action:'add'},context);assert.equal(result.action,'no_trade');assert.ok(result.gateReasons.includes('Missing company evidence: cash flow'));const advice=currentAdvice([gap]);advice.existingPositionStance.value='exit';advice.newEntryStance.value='wait';const sell=gateRecommendation({...rec,action:'sell',entry:{...rec.entry,targetWeightPct:0}},{...context,names:[{...name,research:{id:'r',content:{formalRating:'NOT_RATED',advice}}}]});assert.equal(sell.action,'sell')})
test('unknown limitations and stale identity/price still block supported actions',()=>{const {name,context,rec}=fixture();for(const patch of [{gaps:['Missing company evidence: new essential data']},{quote:null},{gaps:['Stable security identity is unavailable']}])assert.equal(gateRecommendation(rec,{...context,names:[{...name,...patch}]}).action,'no_trade')})
test('company and fund action grounds resolve through their matching frozen packet citation',()=>{
 for (const kind of ['company_packet','etf_packet']) {
  const {name,context,rec}=fixture()
  const id='packet:immutable-version'
  const evidence={...context.evidence[0],id,kind,value:{symbol:'ABC',packet:{sources:[{id:'s'}]}}}
  const scoped={...context,names:[{...name,sources:[id]}],evidence:[evidence]}
  const cited={...rec,sourceIds:[id]}
  assert.equal(gateRecommendation(validateRecommendation(cited,scoped),scoped).action,'hold')
  assert.ok(gateRecommendation({...cited,action:'add'},scoped).gateReasons.includes('Missing company evidence: cash flow'))
  assert.throws(()=>validateRecommendation({...cited,sourceIds:['s']},scoped),/Unknown recommendation citation/)
 }
})
test('a packet citation cannot borrow another instrument, omit grounds or bypass name scope',()=>{
 const {name,context,rec}=fixture()
 const id='packet:immutable-version'
 const evidence={...context.evidence[0],id,kind:'company_packet',value:{symbol:'ABC',packet:{sources:[{id:'s'}]}}}
 const scoped={...context,names:[{...name,sources:[id]}],evidence:[evidence]}
 const cited={...rec,sourceIds:[id]}
 for(const invalid of [
  {...scoped,evidence:[{...evidence,value:{symbol:'OTHER',packet:{sources:[{id:'s'}]}}}]},
  {...scoped,evidence:[{...evidence,value:{symbol:'ABC',packet:{sources:[]}}}]},
  {...scoped,names:[{...name,sources:[]}]},
 ]) assert.ok(gateRecommendation(cited,invalid).gateReasons.includes('Decision must cite its independently supported action grounds'))
 assert.ok(gateRecommendation({...cited,sourceIds:[]},scoped).gateReasons.includes('Decision must cite its independently supported action grounds'))
 const advice=currentAdvice([gap]);advice.newEntryStance.value='wait';advice.decisionSupport!.actionSupport.hold.sourceIds=['s','missing-second-ground']
 assert.ok(gateRecommendation(cited,{...scoped,names:[{...scoped.names[0],research:{id:'r',content:{advice}}}]}).gateReasons.includes('Decision must cite its independently supported action grounds'))
})
test('future uncertainty is scenario-supported, but missing essential evidence cannot be waived',()=>{const future={...gap,id:'adoption',kind:'future_uncertainty' as const,dataKeys:[],blockingActions:[]};assert.ok(hasCurrentResearchContract({advice:currentAdvice([future])}));const essential=currentAdvice([gap]);essential.newEntryStance.value='wait';essential.decisionSupport!.actionSupport.buy.status='supported';assert.throws(()=>validateResearchAdvice(essential,['s']),/essential blocker/);const omitted=currentAdvice();assert.throws(()=>validatePacketDecisionSupport(omitted,['cash flow']),/omitted input/);assert.throws(()=>validatePacketDecisionSupport(omitted,[],[{id:'product',unresolvedQuestions:['Adoption unknown'],sourceIds:['s']}]),/topic:product/)})
test('fresh legacy holdings are selected for upgrades, while full regeneration overrides unchanged marks',()=>{const {name,context}=fixture();assert.equal(recommendationResearchTargets({...context,names:[{...name,gaps:[],research:{id:'old',content:{formalRating:'HOLD'}}},{...name,portfolioId:'other',gaps:[]}]}).length,1);assert.equal(classifyResearchRefresh({priorPacket:{symbol:'ABC'},packet:{symbol:'ABC'},instrument:'equity',forceFullResearch:true}).kind,'full_research')})

test('incomplete advice cannot count as upgraded; pending upgrades expose their frozen question and scheduled check',()=>{
 const advice=currentAdvice();assert.equal(hasCurrentResearchContract({advice:{version:2,decisionSupport:advice.decisionSupport}}),false);
 const {name,context,rec}=fixture();const date='2026-10-04T14:00:00Z';const result=gateRecommendation(rec,{...context,names:[{...name,research:{id:'legacy',content:{formalRating:'HOLD'}},researchUpgrade:{jobId:'j',status:'queued',scheduledFor:date,error:null}}]});
 assert.equal(result.action,'no_trade');assert.equal(result.followUp?.nextCheckAt,date);assert.equal(result.evidenceGaps?.[0].id,'research-contract-upgrade');
})
