import { validateResearchAdvice } from './research-advice.ts'
import { readableCompanySourceIds } from './research-coverage.ts'
import { requiredEvidenceGaps, validateEvidenceAssessment } from './evidence-assessment.ts'
import type { CompanyPacket } from './types.ts'
export * from './evidence-assessment.ts'

/** Increment when a completed report needs a substantive analytical upgrade. */
export const CURRENT_RESEARCH_CONTRACT_VERSION = 1
const object = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {}

/** A persisted version label alone cannot certify an incomplete or corrupt report. */
export function hasCurrentResearchContract(value: unknown, packet?: unknown): boolean {
  const report = object(value), evidence = object(packet)
  if (report.researchContractVersion !== CURRENT_RESEARCH_CONTRACT_VERSION || !Array.isArray(report.sourceIds) || !report.sourceIds.length || report.sourceIds.some(id => typeof id !== 'string') || new Set(report.sourceIds).size !== report.sourceIds.length) return false
  try {
    const allowed = Array.isArray(evidence.sources) ? Array.isArray(evidence.filings) && Array.isArray(evidence.events) ? readableCompanySourceIds(evidence as unknown as CompanyPacket) : evidence.sources.map(s => String(object(s).id)) : report.sourceIds
    if (report.sourceIds.some(id => !allowed.includes(id))) return false
    const assessment = validateEvidenceAssessment(report.evidenceAssessment, report.sourceIds, requiredEvidenceGaps(evidence))
    validateResearchAdvice(report.advice, report.sourceIds, {researchContractVersion: CURRENT_RESEARCH_CONTRACT_VERSION, evidenceAssessment: assessment})
    return true
  } catch { return false }
}

export const RESEARCH_CONTRACT_RULES = 'Return researchContractVersion 1 and evidenceAssessment.version 1. Record every supplied required gap ID exactly once, plus any additional material unresolved facts, with description, availability (not_disclosed/retrieval_failed/not_investigated), affectedActions and resolution. affectedActions identifies only actions whose conclusion this specific missing fact prevents; it is not a list of all actions for which more information would be useful. Do not assume absence is adverse. Distinguish failed collection from public non-disclosure; label not_disclosed only when captured evidence establishes non-disclosure. For actionSupport, include only independently supported buy/add/hold/trim/sell conclusions, with reason, readable sourceIds, gapIds listing ALL assessment gaps reviewed, and observable reversalConditions. Explain why each non-affecting material gap does not overturn that particular conclusion. A gap affecting an action blocks it; actionSupport cannot waive it. Eligible new capital needs buy or add support; retain/reduce/exit needs hold/trim/sell support respectively; an exit conclusion may also support an explicitly justified partial trim. Unresolved conclusions may have an empty actionSupport array. Analyze the strongest opposing case and what would reverse each supported stance. Missing evidence for expansion or adding does not automatically prevent an independently evidenced ownership stance.'
