import { needsDecisionResearchRefresh } from './decision-admission.ts'
import { readResearchAdvice } from './research-advice.ts'
import type { DecisionContext, DecisionName } from './recommendations.ts'

/** Evidence completeness alone cannot skip independent review of a supported action. */
export function recommendationNeedsReview(name: Pick<DecisionName, 'gaps' | 'owned' | 'research'>): boolean {
  if (!name.gaps.length) return true
  const content = name.research?.content
  const advice = readResearchAdvice(content && typeof content === 'object' ? (content as Record<string,unknown>).advice : null)
  const actions = name.owned ? ['add', 'hold', 'trim', 'sell'] as const : ['buy'] as const
  return advice?.version === 2 && actions.some(action => advice.decisionSupport?.actionSupport[action].status === 'supported')
}

export function recommendationResearchTargets(context: DecisionContext) {
  const seen = new Set<string>()
  return context.names.filter(name => {
    if (seen.has(name.symbol) || name.securityId.startsWith('unresolved:') || !needsDecisionResearchRefresh(name)) return false
    seen.add(name.symbol)
    return true
  }).map(name => ({symbol:name.symbol,instrumentType:name.instrumentType,researchId:name.research?.id ?? null}))
}

export function dependencyReadiness(ids: string[], jobs: Array<{id:string;status:string}>) {
  if (ids.some(id => !jobs.some(job => job.id === id))) throw new Error('Recommendation dependency is missing')
  return jobs.every(job => !['queued','running'].includes(job.status))
}

export function parseRecommendationDependencies(payload: Record<string, unknown>): string[] {
  if (payload.dependencyJobIds === undefined) return []
  if (!Array.isArray(payload.dependencyJobIds) || payload.dependencyJobIds.length > 100 ||
      payload.dependencyJobIds.some(id => typeof id !== 'string' || !/^[a-f0-9-]{36}$/i.test(id)))
    throw new Error('Invalid recommendation dependencies')
  return [...new Set(payload.dependencyJobIds as string[])]
}
