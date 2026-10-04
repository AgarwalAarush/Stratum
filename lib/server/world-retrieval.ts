import { createHash, randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { getSupabaseClient } from './supabase.ts'
import { identifyWorldClaims, worldClaimRevision, worldEvidenceOrigin } from './world-claims.ts'
import { rankWorldMemory, validateMemoryQuery, memoryQueryTerms, type WorldMemoryQuery, type MemoryClaim } from '../markets/world-retrieval.ts'
import type { WorldNode, WorldSourceReference } from '../markets/world-thinker-types.ts'

export async function publishWorldMemorySnapshot(commit:string,branch:string,nodes:WorldNode[],sources:WorldSourceReference[]) {
 const db=getSupabaseClient(); if(!db)throw new Error('Supabase service credentials are not configured')
 const refs=new Map(sources.map(s=>[s.id,s]))
 const claims=nodes.flatMap(node=>identifyWorldClaims(node).claims.map(claim=>{
  const ledger=claim.sourceIds.flatMap(id=>refs.has(id)?[refs.get(id)!]:[])
  return {revision_id:worldClaimRevision(claim),claim_id:claim.claimId,node_id:node.id,content:claim,sources:ledger,
   evidence_origins:[...new Set(ledger.map(s=>s.evidenceOrigin??worldEvidenceOrigin(s.url)))]}
 }))
 const result=await db.rpc('publish_world_memory_snapshot',{p_commit:commit,p_branch:branch,p_sources:sources,p_claims:claims})
 if(result.error)throw new Error(`Unable to publish claim history: ${result.error.message}`)
}
export async function retrieveWorldMemory(input:WorldMemoryQuery,options:{ownerId?:string;now?:string;branch?:string}={}) {
 const q=validateMemoryQuery(input), now=options.now??new Date().toISOString(), started=performance.now()
 const db=getSupabaseClient(); if(!db)throw new Error('Supabase service credentials are not configured')
 const cutoff=new Date(Math.min(Date.parse(q.knowledgeCutoff??now),Date.parse(now))).toISOString()
 const liveCanonical=process.env.STRATUM_WORLD_CUTOVER_ENABLED==='true'&&(!q.knowledgeCutoff||Date.parse(q.knowledgeCutoff)>=Date.parse(now))
 let canonicalCommit:string|null=null, snapshotGap:string|null=null
 if(liveCanonical){
  const projection=await db.from('world_repository_projections').select('commit_sha').eq('is_canonical',true).lte('canonical_promoted_at',cutoff).maybeSingle()
  if(projection.error)throw new Error(`World retrieval unavailable: ${projection.error.message}`)
  canonicalCommit=projection.data?.commit_sha??null
  if(!canonicalCommit)snapshotGap='No canonical World projection is available at this cutoff.'
 }
 let snapshots=db.from('world_memory_snapshots').select('commit_sha,accepted_at,sources').lte('accepted_at',cutoff).order('accepted_at',{ascending:false}).limit(1)
 if(canonicalCommit)snapshots=snapshots.eq('commit_sha',canonicalCommit)
 if(options.branch)snapshots=snapshots.eq('branch',options.branch)
 const selected=liveCanonical&&!canonicalCommit?{data:null,error:null}:await snapshots.maybeSingle(); if(selected.error)throw new Error(`World retrieval unavailable: ${selected.error.message}`)
 if(liveCanonical&&canonicalCommit&&!selected.data)snapshotGap='The canonical World memory snapshot is not ready; prior commits are excluded.'
 const snapshot=selected.data, nodes:WorldNode[]=[], claims:MemoryClaim[]=[]
 if(snapshot){
  // Page the snapshot; silently truncating the graph would lose counterevidence.
  for(let offset=0;;offset+=500){
   const page=await db.from('world_file_index').select('structured_content').eq('commit_sha',snapshot.commit_sha).range(offset,offset+499)
   if(page.error)throw new Error(page.error.message)
   nodes.push(...(page.data??[]).map(r=>identifyWorldClaims(r.structured_content as WorldNode)))
   if((page.data??[]).length<500)break
  }
  for(let offset=0;;offset+=500){
   const page=await db.from('world_claim_memberships').select('node_id,world_claim_revisions(*)').eq('commit_sha',snapshot.commit_sha).range(offset,offset+499)
   if(page.error)throw new Error(page.error.message)
   for(const row of page.data??[]){
    const raw=row.world_claim_revisions as unknown as {revision_id:string;claim_id:string;node_id:string;content:MemoryClaim['claim'];accepted_at:string;sources:WorldSourceReference[];evidence_origins:string[]}
    if(raw)claims.push({claimId:raw.claim_id,revisionId:raw.revision_id,nodeId:row.node_id,nodeTitle:nodes.find(n=>n.id===row.node_id)?.title??row.node_id,claim:raw.content,acceptedAt:raw.accepted_at,sources:raw.sources,evidenceOrigins:raw.evidence_origins})
   }
   if((page.data??[]).length<500)break
  }
 }
 const linked=[...new Set(claims.flatMap(c=>[...c.claim.supports??[],...c.claim.contradicts??[],...c.claim.supersedes??[]]))].filter(id=>!claims.some(c=>c.claimId===id))
 for(let start=0;start<linked.length;start+=100){
  const history=await db.from('world_claim_revisions').select('*').in('claim_id',linked.slice(start,start+100)).lte('accepted_at',cutoff).order('accepted_at',{ascending:false})
  if(history.error)throw new Error(history.error.message)
  const seen=new Set<string>()
  for(const r of history.data??[]){if(seen.has(r.claim_id))continue;seen.add(r.claim_id)
   claims.push({claimId:r.claim_id,revisionId:r.revision_id,nodeId:r.node_id,nodeTitle:nodes.find(n=>n.id===r.node_id)?.title??r.node_id,claim:r.content,acceptedAt:r.accepted_at,sources:r.sources,evidenceOrigins:r.evidence_origins,historical:true})
  }
 }
 let issuer=''
 if(q.symbol){const asset=await db.from('market_assets').select('name').eq('symbol',q.symbol).maybeSingle();if(asset.error)throw new Error(asset.error.message);issuer=asset.data?.name??''}
 const bundles=rankWorldMemory({...q,query:`${q.query} ${issuer}`.trim().slice(0,500),knowledgeCutoff:cutoff},nodes,claims,now)
 const reports:Array<{reportId:string;symbol:string;version:number;href:string;dataAsOf:string;knownAt:string}>=[]
 if(options.ownerId){
  let search=db.from('company_research_search_index').select('report_id,symbol,version,data_as_of,indexed_at').eq('owner_id',options.ownerId).lte('indexed_at',cutoff).lte('generated_at',cutoff).order('version',{ascending:false}).limit(q.limit!)
  if(q.symbol)search=search.eq('symbol',q.symbol)
  else search=search.textSearch('search_vector',memoryQueryTerms(q.query).join(' OR '),{type:'websearch',config:'english'})
  if(q.eventFrom)search=search.gte('data_as_of',q.eventFrom)
  if(q.eventTo)search=search.lte('data_as_of',q.eventTo)
  const found=await search; if(found.error)throw new Error(`Report retrieval unavailable: ${found.error.message}`)
  for(const r of found.data??[])reports.push({reportId:r.report_id,symbol:r.symbol,version:r.version,href:`/markets/stocks/${encodeURIComponent(r.symbol)}/research?report=${r.report_id}`,dataAsOf:r.data_as_of,knownAt:r.indexed_at})
 }
 const result={bundles,reports,relatedNodes:nodes.filter(n=>bundles.some(b=>b.relatedNodeIds.includes(n.id))).map(n=>({id:n.id,title:n.title,summary:n.summary})),
  abstention:bundles.length?null:snapshotGap??'No eligible accepted claim matches this query and time window.'}
 const receipt={id:randomUUID(),algorithm:'lexical-alias-relationship-v1',query:q,knowledgeCutoff:cutoff,commit:snapshot?.commit_sha??null,
  retrievedAt:now,claimIds:bundles.map(b=>b.claimId),nodeIds:[...new Set(bundles.map(b=>b.nodeId))],reportIds:reports.map(r=>r.reportId),latencyMs:Math.round(performance.now()-started),
  contextCharacters:JSON.stringify(result).length,digest:createHash('sha256').update(JSON.stringify(result)).digest('hex')}
 return {...result,receipt}
}
/** Only questions and document leads cross into independent company synthesis. */
export function worldResearchPreparation(recall:Awaited<ReturnType<typeof retrieveWorldMemory>>) {
 return {retrievalReceipt:recall.receipt,questions:recall.bundles.map(b=>`Independently test: ${b.claim.text}${b.claim.qualifier?` (${b.claim.qualifier})`:''}`),
  documentUrls:[...new Set(recall.bundles.flatMap(b=>[...b.sources,...b.counterevidence.flatMap(c=>c.sources)].map(s=>s.url)))],
  authority:'questions_and_documents_only' as const}
}
