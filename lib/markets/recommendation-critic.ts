import type {DecisionName} from './recommendations.ts'

/** Both model stages assess advice under the same action and authority rules. */
export const RECOMMENDATION_REVIEW_RULES = `These are proposed recommendations for owner review, never orders or authorization to execute. A research disclaimer that a rating is not transaction authority does not by itself invalidate a recommendation; evaluate the substantive evidence, account fit, timing, and sizing. Do not infer that SELL research mandates liquidation: it may support a proposed trim or sell only when the decision explains the case for reducing this actual holding and justifies its target weight. Hold needs affirmative support and cannot rely on NOT_RATED research. A supported hold, or a reduction supported by documented thesis invalidation or explicit SELL research, does not require a new economic forecast. Buy/add retain all forecast, thesis, entry, liquidity, cash, and sizing requirements. The 10% maximum new position is a buy/add admission limit, not an existing-position cap or mandatory trim trigger. expiresAt is the short validity window for this recommendation and must be after cutoff and within seven days. horizonDays is the longer investment or observation horizon, so expiresAt need not extend to that horizon or to a forecast reporting deadline. A next-session trigger describes a proposed entry or exit for owner consideration and outcome tracking, not automatic execution. Enforce the documented contract rather than inventing additional rules. Never weaken evidence checks because the owner will review the result.`

/** Constrain the checked-in review contract to actual account/security pairs. */
export function recommendationCriticSchema(base: Record<string,unknown>, names: Pick<DecisionName,'portfolioId'|'symbol'>[]) {
  if (!names.length) throw new Error('Review requires covered decision names')
  const schema = structuredClone(base) as {
    properties: {blocks: {items: {properties: Record<string,unknown>; required:string[];additionalProperties:boolean}}}
  }
  const item = schema.properties.blocks.items
  const portfolios = [...new Set(names.map(n=>n.portfolioId))].sort()
  Object.assign(schema.properties.blocks,{items:{anyOf:portfolios.map(portfolioId=>({
    ...item, properties:{...item.properties,
      portfolioId:{type:'string',enum:[portfolioId]},
      symbol:{type:'string',enum:[...new Set(names.filter(n=>n.portfolioId===portfolioId).map(n=>n.symbol))].sort()},
    },
  }))}})
  return schema
}
