import { classifyResearchRefresh, semanticHash, type RefreshDecision } from '../markets/research-refresh.ts'
import { FEEDBACK_RULES, validateFeedbackReview } from '../markets/research-feedback.ts'
import { readableCompanySourceIds } from '../markets/research-coverage.ts'
import { runCodexJson } from './codex-exec.ts'
import { getSupabaseClient } from './supabase.ts'
import type { CompanyPacket, EquityResearchNote, EtfResearchNote, EtfResearchPacket } from '../markets/types.ts'
const object = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {}
export async function recordResearchRefresh(input: {ownerId:string;instrument:'equity'|'etf';packet:CompanyPacket|EtfResearchPacket;priorPacket:unknown;prior:EquityResearchNote|EtfResearchNote|null;reason:string;conditionsChanged?:boolean}): Promise<RefreshDecision> {
  const db=getSupabaseClient();if(!db)throw new Error('Supabase service credentials are not configured')
  const decision=classifyResearchRefresh({priorPacket: input.priorPacket,packet:input.packet,instrument:input.instrument,onDemand:input.reason.startsWith('manual'),priorGeneratedAt:input.prior?.generatedAt,conditionsChanged:input.conditionsChanged})
  let readiness: 'complete'|'partial'|'blocked' = 'complete'
  let update: unknown=null
  if (decision.kind==='revalidate' && input.prior) {
    const allowed=input.instrument==='equity' ? readableCompanySourceIds(input.packet as CompanyPacket) : input.packet.sources.map(s=>s.id)
    const result=await runCodexJson({prompt:`Revalidate only the recorded decision conditions and evidence gaps. ${JSON.stringify(decision)} Compare the prior research with current primary evidence. World dossiers and prior prose are context, never independent facts. State whether the existing conclusion remains supported, which conditions changed, and which uncertainties remain. ${FEEDBACK_RULES} Return feedbackReview and a materialChange only for a supported new result, corporate/fund change, changed decisive premise, or newly available answer to a blocking question. Age and new artifact IDs are not materiality reasons. Compare captured researchDocuments/researchCoverage, including content hashes, new product launches, approvals, deployment and adoption evidence. Reused coverage is previous context; assess new evidence without treating absence as adverse. Return a short cited update; do not generate a full report or invent a material change. Source IDs must be current packet sources. PRIOR ${JSON.stringify(input.prior)} PACKET ${JSON.stringify(input.packet)}`,schemaPath:'schemas/research-revalidation.schema.json',validate:value=>{
      const v=object(value)
      if (!['supported','needs_research','insufficient'].includes(String(v.conclusion)) || typeof v.summary!=='string' || !Array.isArray(v.sourceIds) || v.sourceIds.some(id=>!allowed.includes(String(id))) || !Array.isArray(v.conditions)) throw new Error('Invalid targeted research revalidation')
      if(v.conclusion==='supported' && !v.sourceIds.length)throw new Error('Supported revalidation needs primary evidence')
      if (input.packet.outcomeFeedback) validateFeedbackReview(v.feedbackReview, input.packet.outcomeFeedback)
      if (v.conclusion === 'needs_research') {
        const material = object(v.materialChange)
        const kinds = ['results_guidance','corporate_fund_change','decisive_premise','blocking_answer']
        const ids = Array.isArray(material.sourceIds) ? material.sourceIds.map(String) : []
        const priorSources = Array.isArray(object(input.priorPacket).sources) ? object(input.priorPacket).sources as unknown[] : []
        const currentDocs=input.instrument==='equity' ? (input.packet as CompanyPacket).researchDocuments ?? [] : []
        const priorDocs=Array.isArray(object(input.priorPacket).researchDocuments) ? object(input.priorPacket).researchDocuments as unknown[] : []
        const changedDocumentIds=currentDocs.filter(d=>!priorDocs.some(p=>object(p).sourceId===d.sourceId && object(p).contentHash===d.contentHash && object(p).extractionStatus===d.extractionStatus)).map(d=>d.sourceId)
        const changedSources = [...changedDocumentIds,...input.packet.sources.filter(s => !priorSources.some(p => object(p).id === s.id && semanticHash({...object(p), asOf: null}) === semanticHash({...s, asOf: null}))).map(s => s.id)]
        if (!kinds.includes(String(material.kind)) || typeof material.reason !== 'string' || material.reason.length < 8 || !ids.length || ids.some(id => !allowed.includes(id)) || !ids.some(id => changedSources.includes(id))) throw new Error('Full research requires a recorded material change supported by changed evidence; age alone cannot promote it')
      }
      return v
    },timeoutMs:5*60_000})
    update={...result.data,generation:result.metadata}
    readiness=result.data.conclusion==='supported'?'complete':result.data.conclusion==='insufficient'?'blocked':'partial'
    // The check can nominate material research; it cannot silently promote a report.
    if(result.data.conclusion==='needs_research') {decision.kind='full_research';decision.reasons.push(String(object(result.data.materialChange).reason)); decision.sourceReferences = (object(result.data.materialChange).sourceIds as string[]).map(id => input.packet.sources.find(s => s.id === id)!.url)}
  }
  const price=input.packet.priceHistory.latestPrice, fairValue=input.prior && 'fairValue' in input.prior ? input.prior.fairValue : null
  const output={decision,update,price,fairValue,impliedReturn:typeof price==='number' && price>0 && typeof fairValue==='number'?fairValue/price-1:null,readiness}
  const {error}=await db.from('research_refresh_checks').insert({owner_id:input.ownerId,symbol:input.packet.symbol,instrument_type:input.instrument,research_note_id:input.prior?.id??null,packet_id:input.packet.id,classification:decision.kind,evidence_hash:decision.evidenceHash,content:output,input_hash:semanticHash({decision,packet:input.packet,prior:input.prior?.id??null})})
  if(error && error.code!=='23505') {
    // The independently deployed company path must not require the held refresh
    // migration. Append the check to its newly materialized immutable packet.
    if (!/research_refresh_checks/.test(error.message) || !['PGRST205','42P01'].includes(error.code)) throw new Error(`Unable to log research refresh: ${error.message}`)
    const table=input.instrument==='equity' ? 'company_packets' : 'etf_research_packets'
    Object.assign(input.packet,{researchRefresh:{...output,researchNoteId:input.prior?.id??null,checkedAt:new Date().toISOString()}})
    const {error:packetError}=await db.from(table).update({packet:input.packet}).eq('id',input.packet.id).eq('owner_id',input.ownerId)
    if(packetError)throw new Error(`Unable to freeze packet refresh check: ${packetError.message}`)
  }
  if(readiness==='blocked')throw new Error('Research revalidation blocked by insufficient primary evidence')
  return decision
}

export async function fetchResearchBaseline(ownerId:string,instrument:'equity'|'etf',noteId:string): Promise<unknown> {
  const db=getSupabaseClient();if(!db)throw new Error('Supabase service credentials are not configured')
  const field=instrument==='equity'?'company_packet_id':'etf_research_packet_id'
  const note=await db.from(instrument==='equity'?'equity_research_notes':'etf_research_notes').select(field).eq('id',noteId).eq('owner_id',ownerId).single()
  if(note.error)throw new Error(`Unable to identify frozen research baseline: ${note.error.message}`)
  const packetId=(note.data as unknown as Record<string,unknown>)[field]
  const packet=await db.from(instrument==='equity'?'company_packets':'etf_research_packets').select('packet').eq('id',packetId).eq('owner_id',ownerId).single()
  if(packet.error)throw new Error(`Unable to load frozen research baseline: ${packet.error.message}`)
  return packet.data.packet
}
