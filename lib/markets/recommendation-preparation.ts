import { needsDecisionResearchRefresh } from './decision-admission.ts'
import type { DecisionContext } from './recommendations.ts'

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
