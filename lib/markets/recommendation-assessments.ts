import { validateRecommendation, validateReviewedBatch, type DecisionContext, type DecisionName, type Recommendation } from './recommendations.ts'
import { recommendationNeedsReview } from './recommendation-preparation.ts'

export const RECOMMENDATION_ASSESSMENT_VERSION = 'bounded-assessment-v1'
export const MAX_ASSESSMENT_NAMES = 8
export const assessmentKey = (name: Pick<DecisionName,'portfolioId'|'symbol'>) => `${name.portfolioId}:${name.symbol}`
const object = (value: unknown): Record<string,unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string,unknown> : {}

/** Stable partitions are durable-job identities, not a new discovery filter. */
export function partitionAssessmentNames(names: DecisionName[]) {
  if (new Set(names.map(assessmentKey)).size !== names.length) throw new Error('Duplicate frozen account/security')
  const sorted = [...names].sort((a,b)=>a.symbol.localeCompare(b.symbol)||a.portfolioId.localeCompare(b.portfolioId))
  const batches: DecisionName[][] = []
  for (let i=0;i<sorted.length;i+=MAX_ASSESSMENT_NAMES) batches.push(sorted.slice(i,i+MAX_ASSESSMENT_NAMES))
  return batches
}

export function selectAssessmentNames(context: DecisionContext, keys: unknown): DecisionName[] {
  if (!Array.isArray(keys) || !keys.length || keys.length>MAX_ASSESSMENT_NAMES || keys.some(k=>typeof k!=='string') || new Set(keys).size!==keys.length) throw new Error('Invalid bounded assessment keys')
  return keys.map(key=>{
    const name=context.names.find(n=>assessmentKey(n)===key)
    if (!name) throw new Error('Assessment is outside the frozen owner portfolio')
    return name
  })
}

export type FrozenAssessment = {
  kind: typeof RECOMMENDATION_ASSESSMENT_VERSION
  manifestId: string
  frozenHash: string
  keys: string[]
  recommendations: Recommendation[]
  summary: string
  metadata: Record<string,unknown>
}

/** No partial result, failed review, different cutoff or duplicate can be
 * mistaken for a complete edition. Cash and sizing run again across all parts. */
export function combineFrozenAssessments(context: DecisionContext, frozenHash: string, retained: Recommendation[], results: FrozenAssessment[]) {
  const seen=new Set(retained.map(assessmentKey))
  if(seen.size!==retained.length) throw new Error('Duplicate renewed recommendation')
  const recommendations=[...retained]
  for (const result of results) {
    if(result.kind!==RECOMMENDATION_ASSESSMENT_VERSION||result.manifestId!==context.id||result.frozenHash!==frozenHash) throw new Error('Assessment uses a different frozen manifest')
    const names=selectAssessmentNames(context,result.keys)
    if(result.recommendations.length!==names.length||new Set(result.recommendations.map(assessmentKey)).size!==names.length||result.recommendations.some(r=>!result.keys.includes(assessmentKey(r)))) throw new Error('Assessment result does not cover its exact account/security pairs')
    const critic=object(result.metadata.critic)
    if(names.some(recommendationNeedsReview)) {
      const reviewed=result.metadata.reviewedKeys
      if(critic.status!=='succeeded'||typeof critic.model!=='string'||!Array.isArray(reviewed)||reviewed.length!==names.length||new Set(reviewed).size!==names.length||reviewed.some(k=>!result.keys.includes(k))) throw new Error('Assessment lacks successful independent review for every pair')
    } else if(result.recommendations.some(r=>!['no_trade','research','watch'].includes(r.action))) throw new Error('Unreviewed assessment cannot authorize capital')
    for(const rec of result.recommendations) {
      const key=assessmentKey(rec)
      if(seen.has(key)) throw new Error('Assessment results overlap')
      const criticBlocks=Array.isArray(result.metadata.criticBlocks)?result.metadata.criticBlocks:[]
      if(criticBlocks.some(b=>assessmentKey(object(b) as Pick<DecisionName,'portfolioId'|'symbol'>)===key)&&rec.action!=='no_trade') throw new Error('Independently blocked assessment cannot authorize a decision')
      seen.add(key)
      // Revalidate persisted output without discarding review blocks or forecasts.
      validateRecommendation(rec,context)
      recommendations.push(rec)
    }
  }
  if(seen.size!==context.names.length||context.names.some(n=>!seen.has(assessmentKey(n)))) throw new Error('Completed assessments omit required account/security pairs')
  return validateReviewedBatch(recommendations,context)
}
