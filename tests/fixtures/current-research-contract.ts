import type { ResearchAdvice } from '../../lib/markets/research-advice.ts'
import type { EvidenceAssessment } from '../../lib/markets/research-contract.ts'

export function currentResearchContract(sourceId = 'source-1') {
  const dimension = (value: string) => ({value, reason: 'Current primary operating evidence supports this conclusion.', sourceIds: [sourceId], changeConditions: ['Operating evidence contradicts the central premise.']})
  return {
    researchContractVersion: 1,
    sourceIds: [sourceId],
    advice: {version: 1, businessView: dimension('constructive'), evidenceSufficiency: dimension('sufficient'), newEntryStance: dimension('wait'), existingPositionStance: dimension('retain')} as ResearchAdvice,
    evidenceAssessment: {version: 1, gaps: [], actionSupport: [{action: 'hold', reason: 'Primary operating evidence independently supports retaining existing exposure.', sourceIds: [sourceId], gapIds: [], reversalConditions: ['Operating evidence contradicts the central premise.']}]} as EvidenceAssessment,
  }
}
