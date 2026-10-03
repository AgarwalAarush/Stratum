import type { ResearchAdvice } from '../../lib/markets/research-advice.ts'
import { CAPITAL_ACTIONS, type EvidenceGap } from '../../lib/markets/research-contract.ts'
export function currentAdvice(gaps: EvidenceGap[] = []): ResearchAdvice {
  const dimension = (value:string) => ({value,reason:'Primary operating evidence supports this separately assessed judgment.',sourceIds:['s'],changeConditions:['Reassess after the next reported operating result.']})
  return {
    version:2,businessView:dimension('constructive'),evidenceSufficiency:dimension('limited'),newEntryStance:dimension('eligible'),existingPositionStance:dimension('retain'),
    decisionSupport:{
      evidenceGaps:gaps,actionSupport:Object.fromEntries(CAPITAL_ACTIONS.map(action=>[action,{status:gaps.some(g=>g.blockingActions.includes(action))?'unresolved':'supported',reason:'Independently reported operating evidence supports this particular action; limitations are accounted for in the stated scenarios.',sourceIds:['s'],reviewedGapIds:gaps.map(g=>g.id),reversalConditions:['Reassess if reported demand fails to convert into operating profit.']}])),
      scenarios:[{name:'base',assumptions:'Current demand continues, subject to execution uncertainty.',implication:'Maintain exposure with the stated operating checkpoint.',sourceIds:['s']},{name:'downside',assumptions:'Demand weakens while investment costs remain elevated.',implication:'Reduce exposure if the operating checkpoint fails.',sourceIds:['s']}],followUp:{trigger:'The next published quarterly operating results.',nextCheckAt:null},
    },
  } as ResearchAdvice
}
