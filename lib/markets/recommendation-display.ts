import type { DecisionContext } from './recommendations.ts'

/** Browser projection only; never replaces the immutable decision manifest. */
export function recommendationDisplayContext(row: {content: unknown; content_hash: string} | null) {
  if (!row) return null
  const c = row.content as DecisionContext
  return {content_hash: row.content_hash, content: {
    cutoff: c.cutoff, policy: c.policy, gaps: c.gaps,
    universe: c.universe,
    portfolio: c.portfolio,
    world: Array.isArray(c.world) ? c.world.map(w => ({summary: w?.summary, title:w?.title})) : [],
    names: c.names.map(n => ({portfolioId: n.portfolioId, portfolioName: n.portfolioName, symbol: n.symbol, owned: n.owned})),
    evidence: c.evidence.map(e => ({id:e.id, url:e.url, asOf:e.asOf, availableAt:e.availableAt})),
  }}
}
