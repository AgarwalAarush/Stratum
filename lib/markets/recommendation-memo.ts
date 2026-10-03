import type { DecisionContext } from './recommendations.ts'
import { readResearchAdvice } from './research-advice.ts'
import { readEvidenceAssessment } from './research-contract.ts'
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const text = (value: unknown) => typeof value === 'string' ? value : ''
export function sourceLabel(id: string) {
  const kind = id.split(':')[0]
  return ({research:'Company research',packet:'Financial evidence',portfolio:'Portfolio snapshot',causal:'World model',macro:'Economic indicator',price:'Market price',liquidity:'Trading liquidity',market:'Market snapshot',thesis:'Investment thesis',fund_research:'Fund research',fund_packet:'Fund evidence',source:'Captured research evidence'} as Record<string,string>)[kind] ?? 'Supporting source'
}
/** A bounded reading projection of the original frozen research, never a new opinion. */
export function frozenDecisionMemo(context: Pick<DecisionContext,'names'|'evidence'>) {
  return context.names.map(name => {
    const content = object(object(name.research).content)
    const sections = Array.isArray(content.sections) ? content.sections.map(object) : []
    const companyStory = [
      {id:'business_model_and_moat',title:'What the company is building',legacy:/business model|business & moat/i},
      {id:'market_and_competition',title:'Where it stands against competitors',legacy:/market.*competition|competitive landscape/i},
      {id:'growth_drivers',title:'Roadmap, milestones and roadblocks',legacy:/growth drivers/i},
      {id:'portfolio_exposure',title:'What the fund owns',legacy:/portfolio exposure/i},
      {id:'top_holdings',title:'The businesses behind the exposure',legacy:/top holdings/i},
    ].flatMap(def => {
      const section = sections.find(s => text(s.id) === def.id || (!text(s.id) && def.legacy.test(text(s.title))))
      const content = text(section?.content) || text(section?.body)
      return content ? [{id:def.id,title:def.title,content:content.slice(0,10000)}] : []
    })
    const selected = sections.filter(s => companyStory.some(story => story.id === text(s.id)) || /investment|business|competition|exposure|holdings|financial|growth|valuation|risk|bull|base case|bear|verdict|kill|catalyst/i.test(text(s.title))).slice(0,15)
    return {symbol:name.symbol,portfolioId:name.portfolioId,currentWeightPct:name.currentWeightPct,
      researchId:text(object(name.research).id), thesis:text(content.investmentThesis), keyDebate:text(content.keyDebate), mispricing:text(content.mispricing),
      assessment: {
        advice: readResearchAdvice(content.advice, undefined, {researchContractVersion:content.researchContractVersion,evidenceAssessment:content.evidenceAssessment}),
        evidenceAssessment: readEvidenceAssessment(content.evidenceAssessment),
        status: text(object(name.research).status),
        generatedAt: text(object(name.research).generated_at),
      },
      companyStory,
      research: selected.map(s => ({title:text(s.title),content:(text(s.content)||text(s.body)).slice(0,10000)})),
      world: name.causalLinks.map(id => context.evidence.find(e=>e.id===id)).filter(e=>e?.kind==='causal_model').map(e=> {
        const value=object(e!.value), structured=object(value.structured_content)
        return {id:e!.id,title:text(value.title)||text(structured.title)||'World model',summary:text(value.summary)||text(structured.summary)||text(structured.mechanism),cited:false}
      }),
    }
  })
}
