import type { WorldClaim, WorldNode, WorldSourceReference } from './world-thinker-types.ts'
export interface WorldMemoryQuery {
 query: string; symbol?: string; knowledgeCutoff?: string; eventFrom?: string; eventTo?: string; limit?: number
}
export interface MemoryClaim {
 claimId: string; revisionId: string; nodeId: string; nodeTitle: string; claim: WorldClaim
 historical?: boolean; acceptedAt: string; sources: WorldSourceReference[]; evidenceOrigins: string[]
}
export interface ClaimBundle extends MemoryClaim {
 score: number; counterevidence: MemoryClaim[]; relatedNodeIds: string[]
 evidenceStatus: 'captured' | 'linked_sources_only' | 'assessment'; freshness: 'current' | 'aging' | 'expired'; independentEvidenceCount: number
}
const synonyms: Record<string,string[]> = {
 electricity:['power','grid','energy'], power:['electricity','grid'], chips:['semiconductor','semicap'],
 semiconductor:['chips','semicap'], water:['drought','hydrology'], drought:['water','hydrology'],
 costs:['cost','pricing','margin'], shortage:['constraint','scarcity','bottleneck'],
 constraint:['shortage','bottleneck'], customers:['customer','demand','adoption'],
}
const words = (s: string): string[] => s.toLowerCase().normalize('NFKC').match(/[\p{L}\p{N}.-]+/gu) ?? []
const stop = new Set(['the','a','an','and','or','of','to','for','is','what','how','does','in','on','with','about'])
export function memoryQueryTerms(query: string): string[] {
 return [...new Set(words(query).filter(w=>!stop.has(w)).flatMap(w=>[w,...synonyms[w]??[]]))]
}
export function validateMemoryQuery(input: WorldMemoryQuery): WorldMemoryQuery {
 if (typeof input.query !== 'string' || !input.query.trim() || input.query.length>500) throw new Error('Query must contain 1–500 characters')
 if(input.symbol && !/^[A-Z][A-Z0-9.-]{0,11}$/.test(input.symbol)) throw new Error('Invalid symbol')
 for(const key of ['knowledgeCutoff','eventFrom','eventTo'] as const) if(input[key] && !Number.isFinite(Date.parse(input[key]!))) throw new Error(`Invalid ${key}`)
 if(input.eventFrom && input.eventTo && Date.parse(input.eventFrom)>Date.parse(input.eventTo)) throw new Error('Event range is reversed')
 if(input.limit!==undefined && (!Number.isInteger(input.limit)||input.limit<1||input.limit>50)) throw new Error('Limit must be 1–50')
 return {...input,query:input.query.trim(),limit:input.limit??10}
}
/** Deterministic lexical + alias + one-hop baseline; temporal eligibility precedes ranking. */
export function rankWorldMemory(input: WorldMemoryQuery, nodes: WorldNode[], claims: MemoryClaim[], now: string): ClaimBundle[] {
 const q=validateMemoryQuery(input), cutoff=Math.min(Date.parse(q.knowledgeCutoff??now),Date.parse(now))
 const terms=memoryQueryTerms(q.query), byNode=new Map(nodes.map(n=>[n.id,n]))
 const eligible=claims.filter(c=>{
  if(Date.parse(c.acceptedAt)>cutoff || !byNode.has(c.nodeId))return false
  if(c.sources.some(s=>(s.publishedAt && Date.parse(s.publishedAt)>cutoff)||(s.capturedAt&&Date.parse(s.capturedAt)>cutoff)||(s.ingestedAt&&Date.parse(s.ingestedAt)>cutoff)))return false
  if(q.eventFrom && c.claim.validTo && Date.parse(c.claim.validTo)<Date.parse(q.eventFrom))return false
  if(q.eventTo && c.claim.validFrom && Date.parse(c.claim.validFrom)>Date.parse(q.eventTo))return false
  // Forecasts whose explicit horizon has passed are recalled only in an event-time query.
  if(!q.eventFrom&&!q.eventTo&&c.claim.kind==='forecast'&&c.claim.validTo&&Date.parse(c.claim.validTo)<Date.parse(now))return false
  return true
 })
 const directScore=(c:MemoryClaim)=>{
  const n=byNode.get(c.nodeId)!, text=words(`${n.title} ${n.aliases.join(' ')} ${c.claim.text} ${c.claim.qualifier??''}`).join(' ')
  const hits=terms.filter(t=>text.includes(t)).length
  const symbol=q.symbol && [n.title,...n.aliases].some(a=>words(a).includes(q.symbol!.toLowerCase())) ? 5:0
  return hits+symbol
 }
 const scores=new Map(eligible.map(c=>[c.claimId,directScore(c)])), matchedNodes=new Set(eligible.filter(c=>(scores.get(c.claimId)??0)>0).map(c=>c.nodeId))
 const related=new Set(nodes.filter(n=>matchedNodes.has(n.id)||n.relationships.some(r=>matchedNodes.has(r.targetId))).flatMap(n=>[n.id,...n.relationships.map(r=>r.targetId)]))
 return eligible.flatMap(c=>{
  const n=byNode.get(c.nodeId)!, score=(scores.get(c.claimId)??0)+(related.has(c.nodeId)?0.5:0)
  if(c.historical || score<=0 || ['archived','superseded'].includes(n.status))return []
  const counters=eligible.filter(other=>other.claimId!==c.claimId && (
   c.claim.contradicts?.includes(other.claimId)||other.claim.contradicts?.includes(c.claimId)||
   c.claim.supersedes?.includes(other.claimId)||other.claim.supersedes?.includes(c.claimId)||
   (other.nodeId===c.nodeId&&other.sources.some(s=>s.stance==='contradicting'))))
  const expired=Boolean(c.claim.validTo&&Date.parse(c.claim.validTo)<Date.parse(now))
  return [{...c,score,counterevidence:counters,relatedNodeIds:n.relationships.map(r=>r.targetId),
   freshness:expired?'expired' as const:Date.parse(n.nextReviewAt)<Date.parse(now)?'aging' as const:'current' as const,
   evidenceStatus:c.claim.assessment?'assessment' as const:c.claim.evidence?.length&&c.claim.observationIds?.length?'captured' as const:'linked_sources_only' as const,independentEvidenceCount:new Set(c.evidenceOrigins).size}]
 }).sort((a,b)=>b.score-a.score||a.claimId.localeCompare(b.claimId)).slice(0,q.limit)
}
