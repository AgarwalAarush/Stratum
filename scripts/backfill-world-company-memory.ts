import { getSupabaseClient } from '../lib/server/supabase.ts'
import { reconcileWorldRepositoryProjection } from '../lib/server/world-projection.ts'
import { dispatchCompanyWorldReceipts, refreshCompanyWorldReceiptContext, updateCompanyWorldReceipt } from '../lib/server/company-world-memory.ts'
import { enqueueAgentJob } from '../lib/server/agent-job-queue.ts'
const db=getSupabaseClient()
if(!db)throw new Error('Supabase service credentials are not configured')
// Import the current accepted synthesis, assigning identities at import time, not Git's old dates.
const projection=await reconcileWorldRepositoryProjection({canonical:process.env.STRATUM_WORLD_CUTOVER_ENABLED==='true'})
const indexed=await db.rpc('backfill_company_world_reports')
if(indexed.error)throw new Error(indexed.error.message)
const dispatched=await dispatchCompanyWorldReceipts((payload,key,priority)=>enqueueAgentJob('run-world-thinker',payload,key,{priority}))
const receipts=await db.from('company_world_memory_receipts').select('report_id,owner_id,symbol,status,evidence_gaps,context_node_ids')
if(receipts.error)throw new Error(receipts.error.message)
let contextLinked=0,contextGaps=0
for(const receipt of receipts.data??[]){
 const context=await refreshCompanyWorldReceiptContext(receipt)
 if(context.nodeIds.length)contextLinked++
 if(context.gap){contextGaps++;await updateCompanyWorldReceipt(receipt.report_id,{evidence_gaps:[...new Set([...receipt.evidence_gaps??[],context.gap])]})}
}
const statuses:Record<string,number>={}
const outcomes=await db.from('company_world_memory_receipts').select('status,evidence_gaps')
if(outcomes.error)throw new Error(outcomes.error.message)
for(const r of outcomes.data??[])statuses[r.status]=(statuses[r.status]??0)+1
console.info(JSON.stringify({projection,indexed:indexed.data,dispatched,statuses,contextLinked,contextGaps,evidenceGaps:(outcomes.data??[]).reduce((n,r)=>n+(r.evidence_gaps?.length??0),0)}))
