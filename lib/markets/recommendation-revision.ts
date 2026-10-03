import type { Recommendation } from './recommendations.ts'

type Block = {symbol:string;portfolioId:string;reason:string}
type Batch = {summary:string;recommendations:Recommendation[];failures:unknown[]}
type Result<T,M> = {data:T;metadata:M}
const key = (r:Pick<Recommendation,'portfolioId'|'symbol'>) => `${r.portfolioId}:${r.symbol}`

/** One correction may respond to review; only a fresh independent review can
 * clear it. The caller reapplies the complete frozen portfolio gates. */
export async function reviewWithOneRevision<G,C>(
  initial:Result<Batch,G>,
  review:(batch:Batch)=>Promise<Result<Block[],C>>,
  revise:(targets:Recommendation[],blocks:Block[])=>Promise<Result<Batch,G>>,
  revalidate:(recommendations:Recommendation[])=>Recommendation[],
) {
  const first=await review(initial.data)
  const keys=new Set(first.data.map(key))
  const targets=initial.data.recommendations.filter(r=>keys.has(key(r)))
  if(first.data.some(b=>!targets.some(r=>key(r)===key(b))))throw new Error('Revision review names an uncovered account/security')
  if(!targets.length)return {generated:initial,critic:first,revision:null}
  const correction=await revise(targets,first.data)
  const replacements=correction.data.recommendations
  if(replacements.length!==targets.length||new Set(replacements.map(key)).size!==targets.length||replacements.some(r=>!keys.has(key(r))))throw new Error('Revision must cover only the rejected account/security pairs')
  const generated={...initial,data:{...initial.data,
    summary:correction.data.summary,
    recommendations:revalidate(initial.data.recommendations.map(r=>replacements.find(x=>key(x)===key(r))??r)),
    failures:[...initial.data.failures,...correction.data.failures],
  }}
  const critic=await review(generated.data)
  return {generated,critic,revision:{generator:correction.metadata,initialCritic:first.metadata,
    initialBlocks:first.data,initialProposals:targets,contractFailures:correction.data.failures}}
}
