import type { DecisionContext } from './recommendations.ts'
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const text = (value: unknown) => typeof value === 'string' ? value : ''
export function sourceLabel(id: string) {
  const kind = id.split(':')[0]
  return ({research:'Company research',packet:'Financial evidence',portfolio:'Portfolio snapshot',causal:'World model',macro:'Economic indicator',price:'Market price',liquidity:'Trading liquidity',market:'Market snapshot',thesis:'Investment thesis',fund_research:'Fund research',fund_packet:'Fund evidence'} as Record<string,string>)[kind] ?? 'Supporting source'
}
/** A bounded reading projection of the original frozen research, never a new opinion. */
export function frozenDecisionMemo(context: Pick<DecisionContext,'names'|'evidence'>) {
  return context.names.map(name => {
    const content = object(object(name.research).content)
    const sections = Array.isArray(content.sections) ? content.sections.map(object) : []
    const selected = sections.filter(s => /investment|financial|growth|valuation|risk|bull|base case|bear|verdict|kill/i.test(text(s.title))).slice(0,10)
    return {symbol:name.symbol,portfolioId:name.portfolioId,currentWeightPct:name.currentWeightPct,
      researchId:text(object(name.research).id), thesis:text(content.investmentThesis), keyDebate:text(content.keyDebate), mispricing:text(content.mispricing),
      research: selected.map(s => ({title:text(s.title),content:(text(s.content)||text(s.body)).slice(0,10000)})),
      world: name.causalLinks.map(id => context.evidence.find(e=>e.id===id)).filter(e=>e?.kind==='causal_model').map(e=> {
        const value=object(e!.value), structured=object(value.structured_content)
        return {id:e!.id,title:text(value.title)||text(structured.title)||'World model',summary:text(value.summary)||text(structured.summary)||text(structured.mechanism),cited:false}
      }),
    }
  })
}
