import { semanticHash, semanticValue } from './research-refresh.ts'
import { gateRecommendation, validateRecommendation, type DecisionContext, type DecisionName, type Recommendation } from './recommendations.ts'
const object=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{}
export function nameDecisionSignature(name:DecisionName) {
  const research=object(name.research?.content)
  const ceiling=typeof research.entryZoneHigh==='number'?research.entryZoneHigh:typeof research.fairValue==='number'?research.fairValue:null
  return semanticHash({securityId:name.securityId,portfolioId:name.portfolioId,owned:name.owned,quantity:name.quantity,cash:name.cash,capitalBasis:name.capitalBasis,research:semanticValue(Object.fromEntries(Object.entries(research).filter(([key])=>!['revision','reason','worldContextOrigin'].includes(key)))),thesis:semanticValue(name.thesis),gaps:name.gaps,entryGaps:name.entryGaps,limitations:name.limitations,providerEvidenceGaps:name.providerEvidenceGaps,evidenceAssessment:name.evidenceAssessment,researchContractVersion:name.researchContractVersion,
    quoteCondition: {known:!!name.quote,withinCeiling: name.quote && ceiling!==null ? name.quote.price<=ceiling:null},causalLinks:name.causalLinks})
}
export function decisionContextSignature(context:DecisionContext) {
  return semanticHash({policy:context.policy,contracts:context.contracts,names:context.names.map(n=>({portfolioId:n.portfolioId,symbol:n.symbol,signature:nameDecisionSignature(n)})),gaps:context.gaps,world:semanticValue(context.world),
    macro:context.evidence.filter(e=>['macro_vintage','forecast_resolution','outcome_feedback'].includes(e.kind)).map(e=>semanticValue(e.value))})
}
/** Renewal appends a new issued version; it never mutates expiry on old advice. */
export function renewUnchangedRecommendation(rec:Recommendation,oldContext:DecisionContext,context:DecisionContext):Recommendation|null {
  const prior=oldContext.names.find(n=>n.symbol===rec.symbol&&n.portfolioId===rec.portfolioId), name=context.names.find(n=>n.symbol===rec.symbol&&n.portfolioId===rec.portfolioId)
  if(!prior || !name || oldContext.policy!==context.policy || semanticHash(oldContext.contracts)!==semanticHash(context.contracts) || nameDecisionSignature(prior)!==nameDecisionSignature(name) || Date.parse(rec.expiresAt)<=Date.parse(context.cutoff) || rec.forecasts.some(f=>Date.parse(f.deadline)<=Date.parse(context.cutoff))) return null
  const macro=(c:DecisionContext)=>c.evidence.filter(e=>e.kind==='macro_vintage').map(e=>semanticValue(e.value))
  if(rec.sourceIds.some(id=>oldContext.evidence.some(e=>e.id===id&&e.kind==='macro_vintage')) && semanticHash(macro(oldContext))!==semanticHash(macro(context)))return null
  const map=(id:string)=> {
    const source=oldContext.evidence.find(e=>e.id===id)
    return context.evidence.some(e=>e.id===id) ? id : source ? context.evidence.find(e=>e.kind===source.kind&&semanticHash(e.value)===semanticHash(source.value))?.id:null
  }
  const sources=rec.sourceIds.map(map), forecasts=rec.forecasts.map(f=>({...f,sourceIds:f.sourceIds.map(map),...(f.resolutionSource?.startsWith('source:') ? {resolutionSource:`source:${map(f.resolutionSource.slice(7)) ?? 'unmapped'}`} : {})}))
  if(sources.some(id=>!id) || forecasts.some(f=>f.sourceIds.some(id=>!id)))return null
  try {return gateRecommendation(validateRecommendation({...rec,sourceIds:sources,forecasts,expiresAt:new Date(Date.parse(context.cutoff)+7*86400000).toISOString(),entry:{...rec.entry,targetWeightPct:rec.action==='hold'?name.currentWeightPct:rec.entry.targetWeightPct}},context),context)} catch {return null}
}
