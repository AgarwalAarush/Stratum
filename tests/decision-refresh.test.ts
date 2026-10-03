import test from 'node:test'
import assert from 'node:assert/strict'
import { decisionContextSignature, renewUnchangedRecommendation } from '../lib/markets/decision-refresh.ts'
import type { DecisionContext, Recommendation } from '../lib/markets/recommendations.ts'
const context:DecisionContext={id:'old',ownerId:'owner',date:'2026-09-30',cutoff:'2026-09-30T21:00:00Z',policy:'test',codeVersion:'code',portfolio:[],world:[],market:{id:'snapshot'},gaps:[],universe:[],evidence:[{id:'source',kind:'research',url:'https://issuer.example',asOf:'2026-09-29',availableAt:'2026-09-29',retrievedAt:'2026-09-30',hash:'hash',feed:null,value:{id:'research1',content:{formalRating:'HOLD'}}}],names:[{symbol:'TSLA',securityId:'issuer',portfolioId:'portfolio',owned:true,quantity:10,currentWeightPct:5,portfolioValue:20000,cash:1000,quote:{price:100,feed:'iex',asOf:'2026-09-30T20:00:00Z'},research:{id:'research1',content:{formalRating:'HOLD',fairValue:130}},thesis:{status:'accepted'},averageDollarVolume:100000,sector:'Technology',sources:['source'],gaps:[],causalLinks:[],selectionReason:'Owned position'}]}
const recommendation:Recommendation={symbol:'TSLA',portfolioId:'portfolio',action:'hold',reason:'Durable evidence supports retaining exposure.',thesis:'The operating premise remains supported.',counterThesis:'Demand weakness could invalidate the premise.',mechanism:'Operating leverage supports the existing position.',expectations:'Current expectations leave room for the mechanism.',horizonDays:90,expiresAt:'2026-10-06T21:00:00Z',risks:['Demand weakness remains a risk.'],invalidation:['Disclosed demand deterioration.'],confidence:60,entry:{trigger:'next_session_open',condition:'Retain the existing positive exposure.',maxPrice:null,targetWeightPct:5},exit:'Exit if the decisive premise fails.',reassessWhen:'Reassess at the next official disclosure.',sourceIds:['source'],forecasts:[],dimensions:{thesisQuality:'Supported evidence remains credible.',valuation:'The valuation remains within the accepted range.',timing:'No new entry is proposed.',portfolioFit:'Retaining exposure fits the frozen portfolio.'},alternative:'Holding cash avoids operating risk.',gateReasons:[]}
test('equivalent capture IDs and repricing do not change semantic decision inputs',()=>{
 const next={...context,id:'new',cutoff:'2026-10-01T21:00:00Z',market:{id:'new-snapshot'},names:[{...context.names[0],currentWeightPct:5.1,quote:{price:102,feed:'iex',asOf:'2026-10-01T20:00:00Z'},research:{id:'research2',content:{formalRating:'HOLD',fairValue:130,revision:{priorVersion:2},reason:'refreshed'}}}]}
 assert.equal(decisionContextSignature(next),decisionContextSignature(context))
 const renewed=renewUnchangedRecommendation(recommendation,context,next)
 assert.equal(renewed?.action,'hold');assert.equal(renewed?.entry.targetWeightPct,5.1)
 assert.equal(recommendation.expiresAt,'2026-10-06T21:00:00Z');assert.equal(renewed?.expiresAt,'2026-10-08T21:00:00.000Z')
 assert.notEqual(decisionContextSignature({...next,names:[{...next.names[0],quantity:20}]}),decisionContextSignature(context))
 assert.equal(renewUnchangedRecommendation(recommendation,context,{...next,names:[{...next.names[0],quote:{...next.names[0].quote,price:140}}]}),null)
 assert.equal(renewUnchangedRecommendation(recommendation,context,{...next,cutoff:'2026-10-07T21:00:00Z'}),null)
 // A new editorial contract must regenerate judgment, not renew old prose.
 assert.equal(renewUnchangedRecommendation(recommendation,context,{...next,contracts:{companyStory:1}}),null)
})

test('action-specific evidence classification and contract changes require a new judgment',()=>{
 const withGap={...context,names:[{...context.names[0],providerEvidenceGaps:[{id:'packet:cash flow',description:'cash flow'}]}]}
 assert.notEqual(decisionContextSignature(withGap),decisionContextSignature(context))
 assert.equal(renewUnchangedRecommendation(recommendation,context,withGap),null)
 const assessment={version:1 as const,gaps:[{id:'packet:cash flow',description:'Cash flow disclosure is missing',availability:'retrieval_failed' as const,affectedActions:['add' as const],resolution:'Retrieve the quarterly cash flow statement.'}],actionSupport:[]}
 const assessed={...withGap,names:[{...withGap.names[0],evidenceAssessment:assessment}]}
 const material={...assessed,names:[{...assessed.names[0],evidenceAssessment:{...assessment,gaps:[{...assessment.gaps[0],affectedActions:['hold' as const]}]}}]}
 assert.notEqual(decisionContextSignature(assessed),decisionContextSignature(material))
 assert.equal(renewUnchangedRecommendation(recommendation,assessed,material),null)
})
