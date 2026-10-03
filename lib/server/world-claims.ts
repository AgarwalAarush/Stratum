import { createHash } from 'node:crypto'
import type { WorldClaim, WorldNode, WorldSourceReference } from '../markets/world-thinker-types.ts'

const hash = (value: string) => createHash('sha256').update(value).digest('hex')
export const evidenceText = (value: string) => value.normalize('NFKC').replace(/\s+/g, ' ').trim()
export function stableWorldJson(value:unknown):string {
 const canonical=(v:unknown):unknown=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).filter(([,x])=>x!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>[k,canonical(x)])):v
 return JSON.stringify(canonical(value))
}
/** Identity belongs to the host. A changed assertion keeps its ID only when explicitly revised. */
export function identifyWorldClaims(node: WorldNode): WorldNode {
  const claims = node.claims.map(claim => ({ ...claim,
    claimId: claim.claimId ?? `claim:${hash(`${node.id}:${evidenceText(claim.text)}`).slice(0, 32)}`,
    kind: claim.kind ?? (claim.assessment ? 'analytical_hypothesis' as const : 'observed_fact' as const),
  }))
  if (new Set(claims.map(c => c.claimId)).size !== claims.length) throw new Error(`Duplicate claim identity on ${node.id}`)
  return {...node, claims}
}
export function worldClaimRevision(claim: WorldClaim): string {
  return `revision:${hash(stableWorldJson(claim))}`
}
/** Reports quoting the same underlying document share one evidence origin. */
export function worldEvidenceOrigin(url: string): string {
  const u = new URL(url); u.hash = ''
  for (const key of [...u.searchParams.keys()]) if (/^(utm_|fbclid|gclid)/i.test(key)) u.searchParams.delete(key)
  u.hostname = u.hostname.replace(/^www\./, '')
  u.searchParams.sort()
  return u.toString().replace(/\/$/, '')
}
export interface WorldClaimRevision {
  revision_id: string; claim_id: string; node_id: string; content: WorldClaim
  accepted_at: string; sources: WorldSourceReference[]; evidence_origins: string[]
}
