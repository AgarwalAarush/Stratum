import { findCompanyWorldCommit } from './world-repository.ts'
import type { WorldNode, WorldUpdateProposal } from '../markets/world-thinker-types.ts'
import type { ResearchDocument } from '../markets/research-coverage.ts'
import type { WorldThinkerOptions } from './world-thinker.ts'
import { getSupabaseClient } from './supabase.ts'
import { evidenceText, identifyWorldClaims, worldEvidenceOrigin, stableWorldJson } from './world-claims.ts'

export interface CompanyWorldReceipt {
 report_id:string; owner_id:string; symbol:string; origin:'live'|'backfill'; status:string
 originating_lead_id:string|null; job_id:string|null; run_id:string|null; result_commit:string|null
 affected_node_ids:string[]; affected_claim_ids:string[]; explanation:string|null; evidence_gaps:string[]
}
export interface CompanyWorldFeedback {
 lead:Record<string,unknown>; note:Record<string,unknown>; businessModel:Record<string,unknown>
 sources:Array<{id:string;originalSourceId:string;label:string;url:string;sourceAsOf:string|null;capturedAt:string;origin:string;text:string;quality:ResearchDocument['quality']}>
 evidenceGaps:string[]
}
const obj=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{}
const safeSections=new Set(['business_model_and_moat','market_and_competition','financial_profile','growth_drivers'])
export function sanitizeCompanyWorldFeedback(note:Record<string,unknown>,packet:Record<string,unknown>,model:Record<string,unknown>,ledger:Record<string,unknown>[],lead:Record<string,unknown>={}):CompanyWorldFeedback {
 const reportId=String(note.id), content=obj(note.content), coverage=obj(packet.researchCoverage)
 const docs=[...(Array.isArray(coverage.documents)?coverage.documents.map(obj):[]),...(Array.isArray(packet.researchDocuments)?packet.researchDocuments.map(obj):[])]
 const transcripts=Array.isArray(packet.transcripts)?packet.transcripts.map(obj):[]
 for(const transcript of transcripts){const source=ledger.find(s=>s.source_id===transcript.sourceId);if(source && transcript.content)docs.push({sourceId:transcript.sourceId,url:source.url,text:transcript.content,extractionStatus:'readable',publishedAt:transcript.date,capturedAt:packet.generatedAt,quality:'primary'})}
 const sources:CompanyWorldFeedback['sources']=[], evidenceGaps:string[]=[]
 for(const source of ledger){
  const document=docs.find(d=>d.sourceId===source.source_id&&d.url===source.url)
  if(!document||document.extractionStatus!=='readable'||typeof document.text!=='string'||!document.text.trim()){
   evidenceGaps.push(`Source ${String(source.source_id)}: original readable capture unavailable`); continue
  }
  sources.push({id:`research:${reportId}:${String(source.source_id)}`,originalSourceId:String(source.source_id),label:String(source.label),url:String(source.url),
   sourceAsOf:typeof document.publishedAt==='string'?document.publishedAt:null,capturedAt:String(document.capturedAt),
   // A recapture can change its byte hash without becoming an independent original.
   origin:worldEvidenceOrigin(String(source.url)),text:document.text,quality:document.quality as ResearchDocument['quality']})
 }
 const modelContent=obj(model.content??model),businessModel:Record<string,unknown>={}
 for(const key of ['businessSummary','businessLines','valueChain','demandDrivers','supplyConstraints','causalChain','marketStructure','competitors','strategicRelationships','crossChecks']) if(modelContent[key])businessModel[key]=modelContent[key]
 // Prior reports/models are assessments. Only these separately supplied originals can support facts.
 return {lead:{id:lead.id,originating_node_id:lead.originating_node_id,originating_hypothesis_id:lead.originating_hypothesis_id},
  note:{id:reportId,symbol:note.symbol,version:note.version,dataAsOf:note.data_as_of,
   assessmentSections:Array.isArray(content.sections)?content.sections.map(obj).filter(s=>safeSections.has(String(s.id))):[],
   authority:'analytical_assessments_only'},businessModel,sources,evidenceGaps}
}
export async function loadCompanyWorldFeedback(reportId:string,leadId?:string):Promise<CompanyWorldFeedback|null>{
 const db=getSupabaseClient();if(!db)throw new Error('Supabase service credentials are not configured')
 const receipt=await db.from('company_world_memory_receipts').select('owner_id,symbol').eq('report_id',reportId).maybeSingle()
 if(receipt.error)throw new Error(receipt.error.message)
 if(!receipt.data)return null
 const note=await db.from('equity_research_notes').select('id,symbol,version,status,content,data_as_of,company_packet_id,company_market_model_id').eq('id',reportId).eq('owner_id',receipt.data.owner_id).eq('status','complete').maybeSingle()
 if(note.error)throw new Error(note.error.message);if(!note.data)return null
 const [packet,ledger,model,lead]=await Promise.all([
  db.from('company_packets').select('packet').eq('id',note.data.company_packet_id).eq('owner_id',receipt.data.owner_id).maybeSingle(),
  db.from('equity_research_sources').select('source_id,label,url,source_as_of').eq('research_note_id',reportId),
  note.data.company_market_model_id?db.from('company_market_models').select('content').eq('id',note.data.company_market_model_id).eq('owner_id',receipt.data.owner_id).maybeSingle():Promise.resolve({data:null,error:null}),
  leadId?db.from('world_opportunity_leads').select('id,originating_node_id,originating_hypothesis_id').eq('id',leadId).eq('symbol',note.data.symbol).maybeSingle():Promise.resolve({data:null,error:null}),
 ])
 for(const r of [packet,ledger,model,lead])if(r.error)throw new Error(r.error.message)
 return sanitizeCompanyWorldFeedback(note.data,obj(packet.data?.packet),obj(model.data),ledger.data??[],obj(lead.data))
}
/** Host gate verifies quote lineage; the independent critic checks entailment/materiality. */
export function validateCompanyWorldPublication(proposal:WorldUpdateProposal,feedback:CompanyWorldFeedback,prior:WorldNode[]) {
 if(proposal.opportunityLeads.length||proposal.journal.newInvestigations.length)throw new Error('Company feedback cannot commission research')
 const publication=JSON.stringify({upserts:proposal.upserts,journal:proposal.journal})
 if(/\b(buy_now|nibble|entry_action|formal_rating|brokerage|owner.?s? (?:holdings|position|thesis)|portfolio (?:quantity|position|allocation))\b/i.test(publication))throw new Error('Company feedback cannot publish owner capital actions')
 const sources=new Map(feedback.sources.map(s=>[s.id,s]))
 const existing=new Map(prior.flatMap(n=>identifyWorldClaims(n).claims.map(c=>[c.claimId,stableWorldJson(c)] as const)))
 for(const node of proposal.upserts)for(const raw of node.claims){
  const c=identifyWorldClaims({...node,claims:[raw]}).claims[0]
  if(existing.get(c.claimId)===stableWorldJson(c))continue
  if(c.assessment||c.kind==='analytical_hypothesis')continue
  if(!raw.kind||!c.evidence?.length)throw new Error(`New factual claim requires typed original evidence: ${c.text}`)
  for(const id of c.sourceIds)if(!sources.has(id))throw new Error(`Company claim cites unavailable original evidence ${id}`)
  for(const id of c.sourceIds)if(!c.evidence.some(e=>e.sourceId===id))throw new Error(`Company claim lacks a quote for ${id}`)
  for(const quote of c.evidence){
   const source=sources.get(quote.sourceId)
   if(!source||!c.sourceIds.includes(quote.sourceId)||evidenceText(quote.quote).length<20||!evidenceText(source.text).includes(evidenceText(quote.quote)))throw new Error(`Company claim quote does not match capture ${quote.sourceId}`)
  }
  if(c.kind==='forecast'&&!c.validTo)throw new Error('A forecast requires an explicit validity horizon')
 }
}
export function companyFeedbackHasChanges(proposal:WorldUpdateProposal,prior:WorldNode[]=[]){
 const signature=(node:WorldNode)=>{const {asOf,nextReviewAt,...content}=identifyWorldClaims(node);void asOf;void nextReviewAt;return stableWorldJson(content)}
 return Boolean(proposal.upserts.some(n=>n.kind!=='current'&&signature(n)!==signature(prior.find(p=>p.id===n.id)??{...n,claims:[],body:'',summary:''}))||proposal.archives.length)
}
export async function updateCompanyWorldReceipt(reportId:string,changes:Record<string,unknown>){
 const db=getSupabaseClient();if(!db)throw new Error('Supabase service credentials are not configured')
 const r=await db.from('company_world_memory_receipts').update({...changes,updated_at:new Date().toISOString()}).eq('report_id',reportId)
 if(r.error)throw new Error(`Unable to update memory receipt: ${r.error.message}`)
}
export async function dispatchCompanyWorldReceipts(enqueue:(payload:Record<string,unknown>,key:string,priority:number)=>Promise<{id:string}>){
 const db=getSupabaseClient();if(!db)return 0
 const r=await db.from('company_world_memory_receipts').select('report_id,symbol,origin,originating_lead_id').eq('status','pending').is('job_id',null).order('origin',{ascending:false}).order('created_at').limit(100)
 if(r.error)throw new Error(`Unable to dispatch memory receipts: ${r.error.message}`)
 for(const receipt of r.data??[]){
  const job=await enqueue({trigger:'company_research',researchNoteId:receipt.report_id,symbol:receipt.symbol,worldOpportunityLeadId:receipt.originating_lead_id},`run-world-thinker:company-research:${receipt.report_id}`,receipt.origin==='live'?24:45)
  await updateCompanyWorldReceipt(receipt.report_id,{job_id:job.id})
 }
 return r.data?.length??0
}
export async function reviewCompanyWorldReceipt(reportId:string,jobId:string,review:(options:WorldThinkerOptions)=>Promise<{runId:string;status:string;commit:string|null}>,recover:(commit:string)=>Promise<unknown>){
 const db=getSupabaseClient();if(!db)throw new Error('Supabase service credentials are not configured')
 const claim=await db.rpc('claim_company_world_receipt',{p_report:reportId,p_job:jobId})
 if(claim.error)throw new Error(claim.error.message)
 const receipt=claim.data?.[0] as CompanyWorldReceipt|undefined
 if(!receipt)return {status:'already_reviewed',reportId}
 try{
  // Resume the accepted outbox after a crash instead of commissioning a second review.
  const acceptedCommit=receipt.result_commit??await findCompanyWorldCommit(reportId)
  if(acceptedCommit){
   await recover(acceptedCommit)
   await updateCompanyWorldReceipt(reportId,{status:'applied',result_commit:acceptedCommit,finished_at:new Date().toISOString(),explanation:'Accepted World change projected after recovery.'})
   return {status:'applied',commit:acceptedCommit}
  }
  if(receipt.run_id){
   const prior=await db.from('world_thinker_runs').select('status,outcome_reason,error,result_commit').eq('id',receipt.run_id).maybeSingle()
   if(prior.error)throw new Error(prior.error.message)
   if(prior.data?.status==='noop'||prior.data?.status==='rejected'){
    const status=prior.data.status==='noop'?'no_change':'blocked'
    await updateCompanyWorldReceipt(reportId,{status,explanation:prior.data.outcome_reason??prior.data.error,finished_at:new Date().toISOString()})
    return {status,reportId}
   }
  }
  const feedback=await loadCompanyWorldFeedback(reportId,receipt.originating_lead_id??undefined)
  if(!feedback)throw new Error('Frozen completed report is unavailable')
  await updateCompanyWorldReceipt(reportId,{evidence_gaps:feedback.evidenceGaps})
  if(!feedback.sources.length){
   await updateCompanyWorldReceipt(reportId,{status:'blocked',explanation:'No original readable source captures; legacy analysis remains an assessment.',finished_at:new Date().toISOString()})
   return {status:'blocked',reportId,gaps:feedback.evidenceGaps}
  }
  const result=await review({trigger:'company_research',researchNoteId:reportId,worldOpportunityLeadId:receipt.originating_lead_id??undefined,symbol:receipt.symbol,agentJobId:jobId})
  const status=result.commit?'applied':result.status==='noop'?'no_change':result.status==='rejected'?'blocked':'failed'
  const run=await db.from('world_thinker_runs').select('outcome_reason,error').eq('id',result.runId).single()
  if(run.error)throw new Error(run.error.message)
  await updateCompanyWorldReceipt(reportId,{status,run_id:result.runId,result_commit:result.commit,explanation:run.data.outcome_reason??run.data.error??'Source-backed findings accepted through the World critic.',finished_at:new Date().toISOString()})
  return {...result,status}
 }catch(error){await updateCompanyWorldReceipt(reportId,{status:'failed',finished_at:new Date().toISOString(),explanation:error instanceof Error?error.message:String(error)});throw error}
}
export async function fetchCompanyWorldConnections(ownerId:string,options:{reportId?:string;nodeId?:string}){
 const db=getSupabaseClient();if(!db)return []
 let q=db.from('company_world_memory_receipts').select('*').eq('owner_id',ownerId).order('created_at',{ascending:false}).limit(100)
 if(options.reportId)q=q.eq('report_id',options.reportId)
 if(options.nodeId)q=q.or(`affected_node_ids.cs.${JSON.stringify([options.nodeId])},context_node_ids.cs.${JSON.stringify([options.nodeId])}`)
 const r=await q
 // Additive readers remain available during the application/database rolling upgrade.
 if(r.error){if(r.error.code==='PGRST205'||r.error.code==='42P01')return [];throw new Error(r.error.message)}
 return (r.data??[]) as CompanyWorldReceipt[]
}
