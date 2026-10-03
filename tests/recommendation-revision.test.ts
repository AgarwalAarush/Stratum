import test from 'node:test'
import assert from 'node:assert/strict'
import { reviewWithOneRevision } from '../lib/markets/recommendation-revision.ts'
import { gateRecommendation,abstention,validateReviewedBatch,type DecisionContext,type DecisionName } from '../lib/markets/recommendations.ts'
import { currentAdvice } from './fixtures/research-advice-v2.ts'

const proposal=(symbol='AAA',portfolioId='p',action='research')=>({symbol,portfolioId,action,gateReasons:[]} as unknown as ReturnType<typeof abstention>)
const batch=(recommendations=[proposal()])=>({data:{summary:'Frozen ownership assessment',recommendations,failures:[]},metadata:{stage:'generation'}})
const block={symbol:'AAA',portfolioId:'p',reason:'Supported retention was replaced with generic research.'}

test('review corrections stay scoped, preserve untouched accounts, and require a fresh independent review',async()=>{
 const initial=batch([proposal(),proposal('AAA','other','hold')]),before=structuredClone(initial),seen:unknown[]=[],calls:string[]=[]
 const result=await reviewWithOneRevision(initial,async data=>{calls.push('review');seen.push(structuredClone(data));return {data:calls.length===1?[block]:[],metadata:{stage:'critic'}}},async(targets,blocks)=>{calls.push('revise');assert.deepEqual(targets,[initial.data.recommendations[0]]);assert.deepEqual(blocks,[block]);return batch([proposal('AAA','p','hold')])},recs=>{calls.push('gates');return recs})
 assert.deepEqual(calls,['review','revise','gates','review'])
 assert.equal(result.generated.data.recommendations[0].action,'hold')
 assert.deepEqual(result.generated.data.recommendations[1],initial.data.recommendations[1])
 assert.deepEqual(result.critic.data,[])
 assert.deepEqual(initial,before)
 assert.deepEqual(result.revision?.initialBlocks,[block])
 assert.equal(seen.length,2)
})
test('an accepted proposal is not regenerated; repeated rejection stops after one correction',async()=>{
 let revisions=0,reviews=0
 const accepted=await reviewWithOneRevision(batch(),async()=>({data:[],metadata:null}),async()=>{throw new Error('Unneeded regeneration')},x=>x)
 assert.equal(accepted.revision,null)
 const rejected=await reviewWithOneRevision(batch(),async()=>{reviews++;return {data:[block],metadata:null}},async()=>{revisions++;return batch()},x=>x)
 assert.equal(revisions,1);assert.equal(reviews,2);assert.deepEqual(rejected.critic.data,[block])
})
test('a correction cannot silently modify another portfolio or duplicate a rejected pair',async()=>{
 for(const replacements of [[proposal('AAA','other')],[proposal(),proposal()]])await assert.rejects(reviewWithOneRevision(batch(),async()=>({data:[block],metadata:null}),async()=>batch(replacements),x=>x),/only the rejected/)
})
test('review corrections cannot override missing present pricing, and repeated gates preserve the blocker',async()=>{
 const name={symbol:'AAA',portfolioId:'p',owned:true,currentWeightPct:5,quote:null,research:{content:{advice:currentAdvice()}},sources:['s'],gaps:[],causalLinks:[]} as unknown as DecisionName
 const context={cutoff:'2026-10-03T12:00:00Z',policy:'prospective-v1.7',names:[name],evidence:[{id:'s',availableAt:'2026-10-02'}],gaps:[]} as unknown as DecisionContext
 const rec={...abstention(name,context,'A substantive ownership assessment'),action:'hold' as const,sourceIds:['s'],gateReasons:[],entry:{condition:'Retain current exposure',maxPrice:null,targetWeightPct:5}}
 const result=await reviewWithOneRevision(batch([proposal()]),async()=>({data:[block],metadata:null}),async()=>batch([gateRecommendation(rec,context)]),recs=>validateReviewedBatch(recs,context))
 assert.equal(result.generated.data.recommendations[0].action,'no_trade')
 assert.equal(result.generated.data.recommendations[0].assessmentStatus,'blocked')
 assert.ok(result.generated.data.recommendations[0].gateReasons.some(r=>r.includes('Price is unavailable')))
})
