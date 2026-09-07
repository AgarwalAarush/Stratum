import type { DecisionContext, Recommendation } from './recommendations.ts'

export function decisionIsBlocked(rec: Recommendation): boolean {
  return Boolean(rec.gateReasons?.length)
}

/** Preserve evidence IDs in the source ledger, not in the owner's first line. */
export function readableDecisionText(text: string): string {
  return text.replace(/\[(?:portfolio|research|packet|quote|liquidity|world|source):[^\]]+\]/g, '')
    .replace(/\b[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\b/gi, '')
    .replace(/^(?:Independent review blocked action:|Evaluation blocked:)\s*/i, '')
    .replace(/^Blocking[^:]{0,45}:\s*/i, '')
    .replace(/\s+/g, ' ').trim()
}

export function decisionHeadline(rec: Recommendation): string {
  if (!decisionIsBlocked(rec)) return readableDecisionText(rec.reason)
  const reasons = [rec.reason, ...rec.gateReasons].join(' ')
  if (/target weight|targetWeight|target size|sizing|partial reduction|sell targets zero|exposure.*size/i.test(reasons))
    return 'The proposed position change needs a clear, justified size before acting.'
  if (/quote|price is unavailable|stale price/i.test(reasons) && /missing|unavailable|no current|stale/i.test(reasons))
    return 'Price or research evidence is incomplete. Wait for a fresh assessment before acting.'
  if (/forecast|probability|directional claim/i.test(reasons))
    return 'The forecast did not pass evidence review. Wait for a supported assessment.'
  return 'This decision did not pass review. Resolve the evidence gaps before acting.'
}

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
