import type {DecisionName} from './recommendations.ts'

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
