import type { DecisionContext, Recommendation } from './recommendations.ts'
import { forecastsAreApproved, forecastCategory } from './forecast-review.ts'

export const WORLD_ABLATION_POLICY = 'world-context-ablation-v1'

/** This measures incremental explicit World context given identical company
 * research. It cannot measure World information already embedded in research. */
export function withoutWorldContext(context: DecisionContext): DecisionContext {
  const copy = structuredClone(context)
  const excluded = new Set(copy.evidence.filter(e => e.kind === 'causal_model').map(e => e.id))
  copy.world = []
  copy.evidence = copy.evidence.filter(e => !excluded.has(e.id))
  copy.names = copy.names.map(n => ({ ...n, causalLinks: [], sources: n.sources.filter(id => !excluded.has(id)) }))
  return copy
}

export function selectAblationQuestions(recommendations: Recommendation[], cutoff: string) {
  const seen = new Set<string>()
  return recommendations.slice().sort((a, b) => a.symbol.localeCompare(b.symbol) || a.portfolioId.localeCompare(b.portfolioId)).flatMap((r, ri) => {
    if (seen.has(r.symbol) || !forecastsAreApproved(r)) return []
    const fi = r.forecasts.findIndex(f => forecastCategory(f) === 'economic' && Boolean(f.observationPeriod && f.unit) &&
      Date.parse(f.deadline) > Date.parse(cutoff) && Date.parse(f.deadline) <= Date.parse(cutoff) + 95 * 86400000)
    if (fi < 0) return []
    seen.add(r.symbol)
    const f = r.forecasts[fi]
    return [{ key: `${ri}:${fi}`, symbol: r.symbol, portfolioId: r.portfolioId, ordinal: fi,
      proposition: f.proposition, metric: f.metric, operator: f.operator, threshold: f.threshold,
      observationPeriod: f.observationPeriod, unit: f.unit, deadline: f.deadline }]
  }).slice(0, 6)
}

export function validateAblationAnswers(value: unknown, keys: string[], evidenceIds: Set<string>) {
  const input = value as { answers?: Array<{ key: string; probability: number | null; reason: string; sourceIds: string[] }> }
  if (!Array.isArray(input?.answers) || input.answers.length !== keys.length) throw new Error('Ablation question coverage mismatch')
  const seen = new Set<string>()
  for (const answer of input.answers) {
    if (!keys.includes(answer.key) || seen.has(answer.key)) throw new Error('Unknown or duplicate ablation question')
    seen.add(answer.key)
    if (answer.probability !== null && (!Number.isFinite(answer.probability) || answer.probability <= 0 || answer.probability >= 1)) throw new Error('Invalid ablation probability')
    if (!answer.reason || !Array.isArray(answer.sourceIds) || answer.sourceIds.some(id => !evidenceIds.has(id)) || (answer.probability !== null && !answer.sourceIds.length)) throw new Error('Unsubstantiated ablation forecast')
  }
  return input.answers
}
