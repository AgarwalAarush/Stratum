import test from 'node:test'
import assert from 'node:assert/strict'
import { startRecommendationEdition, runRecommendationAssessment, finalizeRecommendationEdition } from '../lib/server/recommendation-edition-jobs.ts'
import { contentHash } from '../lib/server/recommendations.ts'
import type { DecisionContext } from '../lib/markets/recommendations.ts'

test('durable bounded jobs reuse their frozen identities, publish only complete reviewed results, and reject foreign or failed prerequisites',async t=>{
  process.env.SUPABASE_URL='https://edition-jobs-test.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY='fixture-key'
  const owner='00000000-0000-4000-8000-000000000001'
  const context:DecisionContext={id:'00000000-0000-4000-8000-000000000009',ownerId:owner,date:'2026-10-03',cutoff:'2026-10-03T14:00:00Z',policy:'prospective-v1.7',codeVersion:'fixture',portfolio:[],evidence:[],world:[],market:null,gaps:[],universe:[],
    names:Array.from({length:17},(_,i)=>({symbol:`ABC${i}`,securityId:`asset-${i}`,portfolioId:'account',owned:true,quantity:1,currentWeightPct:1,portfolioValue:1000,cash:100,quote:null,research:null,thesis:null,sources:[],gaps:['Company research is missing'],causalLinks:[],selectionReason:'owned'}))}
  const jobs=new Map<string,{id:string;type:string;payload:Record<string,unknown>;status:string;output?:unknown}>()
  let published=0,publishedRows:unknown[]=[]
  t.mock.method(globalThis,'fetch',async (input:RequestInfo|URL,init?:RequestInit)=>{
    const url=new URL(String(input)),table=url.pathname.split('/').at(-1)
    if(table==='recommendation_input_manifests') return Response.json({content:context,content_hash:contentHash(context)})
    if(table==='recommendation_batches') {
      if(!url.searchParams.has('manifest_id')) assert.equal(url.searchParams.get('published_at'),`lte.${context.cutoff}`)
      return Response.json(published&&url.searchParams.has('manifest_id')?{id:'batch'}:null)
    }
    if(table==='agent_jobs') {
      const job=[...jobs.values()].find(j=>`eq.${j.id}`===url.searchParams.get('id'))
      return Response.json(job?{status:job.status,payload:job.payload,job_type:job.type}:null)
    }
    if(table==='agent_runs') {
      const job=[...jobs.values()].find(j=>`eq.${j.id}`===url.searchParams.get('job_id'))
      return Response.json(job?.output?{id:`run-${job.id}`,output:job.output}:null)
    }
    if(table==='publish_recommendation_batch') {
      published++
      publishedRows=JSON.parse(String(init?.body)).p_recommendations
      return Response.json('batch')
    }
    throw new Error(`Unexpected table ${table}`)
  })
  const enqueue=async(type:string,payload:Record<string,unknown>,key:string)=>{
    const existing=jobs.get(key)
    if(existing) return {id:existing.id,deduplicated:true}
    const id=`00000000-0000-4000-8000-${String(jobs.size+1).padStart(12,'0')}`
    jobs.set(key,{id,type,payload,status:'queued'})
    return {id,deduplicated:false}
  }
  const plan=await startRecommendationEdition(owner,new Date(context.cutoff),'daily',enqueue)
  assert.ok('preparing' in plan&&plan.preparing)
  if(!('dependencyJobIds' in plan)) throw new Error('Expected durable plan')
  assert.equal(plan.assessmentCount,3)
  assert.deepEqual([...jobs.values()].filter(j=>j.payload.phase==='assess').map(j=>(j.payload.assessmentKeys as string[]).length),[8,8,1])
  assert.deepEqual(await startRecommendationEdition(owner,new Date(context.cutoff),'daily',enqueue),plan)
  assert.equal(jobs.size,4)
  const first=[...jobs.values()][0]
  await assert.rejects(finalizeRecommendationEdition(owner,context.id,plan.dependencyJobIds),/prerequisite.*queued/)
  first.status='failed'
  await assert.rejects(finalizeRecommendationEdition(owner,context.id,plan.dependencyJobIds),/prerequisite.*failed/)
  assert.equal(published,0)
  for(const job of jobs.values()) {
    if(job.payload.phase!=='assess') continue
    job.output=await runRecommendationAssessment(owner,context.id,job.payload.assessmentKeys)
    job.status='succeeded'
  }
  first.payload.ownerId='another-owner'
  await assert.rejects(finalizeRecommendationEdition(owner,context.id,plan.dependencyJobIds),/another owner/)
  first.payload.ownerId=owner
  await assert.rejects(runRecommendationAssessment('another-owner',context.id,first.payload.assessmentKeys),/owner or integrity/)
  assert.equal(published,0)
  const result=await finalizeRecommendationEdition(owner,context.id,plan.dependencyJobIds)
  assert.equal(result.batchId,'batch')
  assert.equal(published,1)
  assert.equal(publishedRows.length,17)
  assert.deepEqual(await finalizeRecommendationEdition(owner,context.id,plan.dependencyJobIds),{batchId:'batch',reused:true})
  assert.equal(published,1)
})
