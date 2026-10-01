import { getSupabaseClient } from './supabase.ts'
import type { CompanyPacketSource } from '../markets/types.ts'
import type { GenerationMetadata } from '../ai/config.ts'
const tables = {
  equity: {notes:'equity_research_notes',sources:'equity_research_sources',packet:'company_packet_id'},
  etf: {notes:'etf_research_notes',sources:'etf_research_sources',packet:'etf_research_packet_id'},
} as const
export type ResearchKind = keyof typeof tables
function database() {const db=getSupabaseClient();if(!db)throw new Error('Supabase service credentials are not configured');return db}
export async function beginResearchVersion(input:{kind:ResearchKind;ownerId:string;symbol:string;packetId:string;dataAsOf:string;previousId:string|null;extra?:Record<string,unknown>}) {
  const db=database(), t=tables[input.kind]
  const latest=await db.from(t.notes).select('version').eq('owner_id',input.ownerId).eq('symbol',input.symbol).order('version',{ascending:false}).limit(1).maybeSingle()
  if(latest.error)throw new Error(`Unable to read research lineage: ${latest.error.message}`)
  const version=Number(latest.data?.version??0)+1
  const payload={symbol:input.symbol,owner_id:input.ownerId,[t.packet]:input.packetId,version,status:'running',data_as_of:input.dataAsOf,...input.extra}
  let created=await db.from(t.notes).insert({...payload,previous_research_note_id:input.previousId}).select('id').single()
  if(input.kind==='equity' && created.error?.message.includes('previous_research_note_id')) created=await db.from(t.notes).insert(payload).select('id').single()
  if(created.error || !created.data)throw new Error(`Unable to create research version: ${created.error?.message??'No record'}`)
  return {id:created.data.id as string,version}
}
export async function publishResearchVersion(input:{kind:ResearchKind;id:string;content:Record<string,unknown>;sources:CompanyPacketSource[];metadata:GenerationMetadata;generatedAt:string;extra?:Record<string,unknown>}) {
  const db=database(),t=tables[input.kind],used=new Set(input.content.sourceIds as string[])
  const sources=input.sources.filter(s=>used.has(s.id))
  if(!sources.length)throw new Error('Research publication requires a durable source ledger')
  const ledger=await db.from(t.sources).insert(sources.map(s=>({research_note_id:input.id,source_id:s.id,label:s.label,url:s.url,source:s.source,source_as_of:s.asOf})))
  if(ledger.error)throw new Error(`Unable to persist research sources: ${ledger.error.message}`)
  const saved=await db.from(t.notes).update({status:'complete',formal_rating:input.content.formalRating,entry_action:input.content.entryAction,content:input.content,provider:input.metadata.provider,model:input.metadata.model,generated_at:input.generatedAt,error:null,...input.extra}).eq('id',input.id).eq('status','running').select('id').single()
  if(saved.error || !saved.data)throw new Error(`Unable to publish research version: ${saved.error?.message??'Version is not running'}`)
}
export async function failResearchVersion(kind:ResearchKind,id:string,error:unknown) {
  const failed=await database().from(tables[kind].notes).update({status:'failed',error:error instanceof Error?error.message:String(error)}).eq('id',id).eq('status','running')
  if(failed.error)throw new Error(`Unable to record failed research version: ${failed.error.message}`)
}
