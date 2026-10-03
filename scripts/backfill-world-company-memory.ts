import { getSupabaseClient } from '../lib/server/supabase.ts'
import { reconcileWorldRepositoryProjection } from '../lib/server/world-projection.ts'
import { dispatchCompanyWorldReceipts } from '../lib/server/company-world-memory.ts'
import { enqueueAgentJob } from '../lib/server/agent-jobs.ts'
const db=getSupabaseClient()
if(!db)throw new Error('Supabase service credentials are not configured')
// Import the current accepted synthesis, assigning identities at import time, not Git's old dates.
const projection=await reconcileWorldRepositoryProjection({canonical:false})
const indexed=await db.rpc('backfill_company_world_reports')
if(indexed.error)throw new Error(indexed.error.message)
const dispatched=await dispatchCompanyWorldReceipts((payload,key,priority)=>enqueueAgentJob('run-world-thinker',payload,key,{priority}))
const receipts=await db.from('company_world_memory_receipts').select('status,evidence_gaps')
if(receipts.error)throw new Error(receipts.error.message)
const statuses:Record<string,number>={}
for(const r of receipts.data??[])statuses[r.status]=(statuses[r.status]??0)+1
console.info(JSON.stringify({projection,indexed:indexed.data,dispatched,statuses,evidenceGaps:(receipts.data??[]).reduce((n,r)=>n+(r.evidence_gaps?.length??0),0)}))
