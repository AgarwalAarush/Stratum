import test from 'node:test'
import assert from 'node:assert/strict'
import { reviewCompanyWorldReceipt, refreshCompanyWorldReceiptContext } from '../lib/server/company-world-memory.ts'
const report='00000000-0000-4000-8000-000000000010',job='00000000-0000-4000-8000-000000000011'
test('linking backfilled terminal reports preserves preparation links without commissioning another review',async t=>{
 process.env.SUPABASE_URL='https://memory-test.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='test-service-role'
 const writes:Record<string,unknown>[]=[]
 t.mock.method(globalThis,'fetch',async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=String(input);let response:unknown=[]
  if(init?.method==='PATCH'){writes.push(JSON.parse(String(init.body)));response=[]}
  else if(url.includes('/world_memory_snapshots'))response=[{commit_sha:'commit',accepted_at:'2026-01-01',sources:[]}]
  else if(url.includes('/world_file_index'))response=[{structured_content:{id:'grid',title:'Power constraint',kind:'theme',status:'active',aliases:[],relationships:[],claims:[],nextReviewAt:'2099-01-01'}}]
  else if(url.includes('/world_claim_memberships'))response=[{node_id:'grid',world_claim_revisions:{revision_id:'revision',claim_id:'claim',content:{text:'Business demand strains grid capacity',sourceIds:[],assessment:true},accepted_at:'2026-01-01',sources:[],evidence_origins:[]}}]
  else if(url.includes('/company_research_search_index'))assert.ok(url.includes('owner_id=eq.owner'))
  else if(url.includes('/rpc/'))throw new Error('Context linking must not claim or commission a review')
  return new Response(JSON.stringify(response),{status:200,headers:{'Content-Type':'application/json'}})
 })
 try{
  const result=await refreshCompanyWorldReceiptContext({report_id:report,owner_id:'owner',symbol:'ABC',context_node_ids:['prep-node']})
  assert.deepEqual(result.nodeIds,['prep-node','grid']);assert.equal(result.gap,null)
  assert.deepEqual(Object.keys(writes[0]).sort(),['context_node_ids','updated_at']);assert.equal(writes.length,1)
 }finally{t.mock.restoreAll();delete process.env.SUPABASE_URL;delete process.env.SUPABASE_SERVICE_ROLE_KEY}
})
test('interruption resumes accepted commit; no-change and critic rejection remain terminal without a second model review',async t=>{
 process.env.SUPABASE_URL='https://memory-test.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='test-service-role';process.env.STRATUM_WORLD_ROOT='/tmp/stratum-world-recovery-absent'
 for(const disposition of ['accepted','noop','rejected','projection_failure']){
  const updates:Record<string,unknown>[]=[]
  t.mock.method(globalThis,'fetch',async(input:RequestInfo|URL,init?:RequestInit)=>{
   const url=String(input)
   let response:unknown=[]
   if(url.includes('/rpc/claim_company_world_receipt'))response=[{report_id:report,owner_id:'owner',symbol:'ABC',origin:'live',status:'reviewing',run_id:'run',result_commit:['accepted','projection_failure'].includes(disposition)?'accepted-commit':null}]
   else if(url.includes('/world_thinker_runs'))response=[{status:disposition,outcome_reason:'No independently supported material change.',error:'Critic rejected unsupported causal support.'}]
   else if(init?.method==='PATCH'){updates.push(JSON.parse(String(init.body)));response=[]}
   return new Response(JSON.stringify(response),{status:200,headers:{'Content-Type':'application/json'}})
  })
  let reviews=0,projections=0
  const run=()=>reviewCompanyWorldReceipt(report,job,async()=>{reviews++;throw new Error('Unexpected second review')},async commit=>{assert.equal(commit,'accepted-commit');projections++;if(disposition==='projection_failure')throw new Error('Projection interrupted')})
  if(disposition==='projection_failure'){await assert.rejects(run(),/Projection interrupted/);assert.equal(updates.at(-1)?.status,'failed')}
  else {const result=await run();assert.equal(result.status,disposition==='accepted'?'applied':disposition==='noop'?'no_change':'blocked');assert.ok(updates.at(-1)?.explanation)}
  assert.equal(reviews,0);assert.equal(projections,['accepted','projection_failure'].includes(disposition)?1:0)
  t.mock.restoreAll()
 }
 delete process.env.SUPABASE_URL;delete process.env.SUPABASE_SERVICE_ROLE_KEY;delete process.env.STRATUM_WORLD_ROOT
})

test('a failed review remains a failed receipt and rejects the attempt so the queue can retry',async t=>{
 process.env.SUPABASE_URL='https://memory-test.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='test-service-role';process.env.STRATUM_WORLD_ROOT='/tmp/stratum-world-recovery-absent'
 const updates:Record<string,unknown>[]=[]
 t.mock.method(globalThis,'fetch',async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=String(input);let response:unknown=[]
  if(url.includes('/rpc/claim_company_world_receipt'))response=[{report_id:report,owner_id:'owner',symbol:'ABC',status:'reviewing',run_id:null,result_commit:null}]
  else if(init?.method==='PATCH'){updates.push(JSON.parse(String(init.body)));response=[]}
  else if(url.includes('/company_world_memory_receipts'))response=[{owner_id:'owner',symbol:'ABC'}]
  else if(url.includes('/equity_research_notes'))response=[{id:report,symbol:'ABC',version:1,content:{sections:[]},company_packet_id:'packet'}]
  else if(url.includes('/company_packets'))response=[{packet:{researchDocuments:[{sourceId:'source',url:'https://issuer.example/filing',text:'Original captured company statement.',extractionStatus:'readable',capturedAt:'2026-10-01',quality:'primary'}]}}]
  else if(url.includes('/equity_research_sources'))response=[{source_id:'source',label:'Filing',url:'https://issuer.example/filing'}]
  else if(url.includes('/world_thinker_runs'))response={error:'Provider execution failed',outcome_reason:null}
  return new Response(JSON.stringify(response),{status:200,headers:{'Content-Type':'application/json'}})
 })
 try{
  await assert.rejects(reviewCompanyWorldReceipt(report,job,async()=>({runId:'failed-run',status:'failed',commit:null}),async()=>{}),/Provider execution failed/)
  assert.equal(updates.at(-1)?.status,'failed');assert.equal(updates.at(-1)?.explanation,'Provider execution failed')
 }finally{t.mock.restoreAll();delete process.env.SUPABASE_URL;delete process.env.SUPABASE_SERVICE_ROLE_KEY;delete process.env.STRATUM_WORLD_ROOT}
})
