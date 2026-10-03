import test from 'node:test'
import assert from 'node:assert/strict'
import { reviewCompanyWorldReceipt } from '../lib/server/company-world-memory.ts'
const report='00000000-0000-4000-8000-000000000010',job='00000000-0000-4000-8000-000000000011'
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
