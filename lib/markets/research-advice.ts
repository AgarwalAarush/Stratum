import { validateEvidenceAssessment, type EvidenceAssessment } from './evidence-assessment.ts'
/** Versioned meanings shared by research, recommendation validation, critics and presentation. */
export const ADVICE_VALUES = {
  businessView: ['constructive', 'mixed', 'adverse', 'undetermined'],
  evidenceSufficiency: ['sufficient', 'limited', 'insufficient'],
  newEntryStance: ['eligible', 'wait', 'avoid', 'undetermined'],
  existingPositionStance: ['retain', 'reduce', 'exit', 'undetermined'],
} as const
export type AdviceDimension<K extends keyof typeof ADVICE_VALUES> = {
  value: typeof ADVICE_VALUES[K][number]; reason: string; sourceIds: string[]; changeConditions: string[]
}
export type ResearchAdvice = { version: 1 } & { [K in keyof typeof ADVICE_VALUES]: AdviceDimension<K> }
export const RESEARCH_ADVICE_RULES = 'Return advice.version 1 with four separately evidenced dimensions: businessView (constructive/mixed/adverse/undetermined), evidenceSufficiency (sufficient/limited/insufficient), newEntryStance (eligible/wait/avoid/undetermined), existingPositionStance (retain/reduce/exit/undetermined). Each dimension requires value, cited reason, sourceIds and observable changeConditions. Separate business opinion, evidence quality, entry timing and disposition of an existing holding. A wait or avoid for a new entry need not mean an existing holding should be exited. Retain must affirm continued positive exposure; it cannot prescribe zero ownership. Insufficient overall evidence prevents eligible new entry. Under researchContractVersion 1, independently supported retain/reduce/exit can remain valid when evidenceAssessment explicitly reviews every gap, none affects that action, and actionSupport supplies captured citations, an explanation of why the limitations do not undermine the action, and observable reversal conditions. If a decisive fact prevents the ownership conclusion, use undetermined rather than inventing a directional call. Historical reports without this validated contract retain their original evidence rules. Legacy ratings do not determine these fields.'
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
export type ResearchAdviceAssessmentContext = { researchContractVersion?: unknown; evidenceAssessment?: unknown }
export function validateResearchAdvice(value: unknown, allowedSourceIds?: readonly string[], context?: ResearchAdviceAssessmentContext): ResearchAdvice {
  const advice = object(value)
  if (advice.version !== 1) throw new Error('Missing versioned research advice')
  for (const [key, values] of Object.entries(ADVICE_VALUES)) {
    const field = object(advice[key])
    if (!(values as readonly unknown[]).includes(field.value) || typeof field.reason !== 'string' || field.reason.trim().length < 8 || !Array.isArray(field.sourceIds) || !field.sourceIds.length || field.sourceIds.some(id => typeof id !== 'string' || (allowedSourceIds && !allowedSourceIds.includes(id))) || !Array.isArray(field.changeConditions) || !field.changeConditions.length || field.changeConditions.some(c => typeof c !== 'string' || c.trim().length < 8)) throw new Error(`Invalid cited research advice: ${key}`)
  }
  const result = advice as ResearchAdvice
  let assessment: EvidenceAssessment | null = null
  if (context?.researchContractVersion === 1) assessment = validateEvidenceAssessment(context.evidenceAssessment, allowedSourceIds)
  const ownershipAction = result.existingPositionStance.value === 'retain' ? 'hold' : result.existingPositionStance.value === 'reduce' ? 'trim' : result.existingPositionStance.value === 'exit' ? 'sell' : null
  const independentlySupported = ownershipAction !== null && assessment !== null && assessment.actionSupport.some(s => s.action === ownershipAction && s.sourceIds.some(id => result.existingPositionStance.sourceIds.includes(id))) && !assessment.gaps.some(g => g.affectedActions.includes(ownershipAction))
  if (assessment) {
    for (const support of assessment.actionSupport) {
      const newCapital = support.action === 'buy' || support.action === 'add'
      const compatible = newCapital ? result.newEntryStance.value === 'eligible' : support.action === 'hold' ? result.existingPositionStance.value === 'retain' : support.action === 'trim' ? ['reduce', 'exit'].includes(result.existingPositionStance.value) : result.existingPositionStance.value === 'exit'
      const stanceSources = newCapital ? result.newEntryStance.sourceIds : result.existingPositionStance.sourceIds
      if (!compatible || !support.sourceIds.some(id => stanceSources.includes(id))) throw new Error('Action support conflicts with the independently cited research stance')
    }
    if (result.newEntryStance.value === 'eligible' && !assessment.actionSupport.some(s => ['buy', 'add'].includes(s.action) && s.sourceIds.some(id => result.newEntryStance.sourceIds.includes(id)))) throw new Error('Eligible new entry lacks independently cited buy/add support')
  }
  if (result.evidenceSufficiency.value === 'insufficient' && (result.newEntryStance.value === 'eligible' || (result.existingPositionStance.value === 'retain' && !independentlySupported))) throw new Error('Insufficient evidence cannot establish eligible entry or affirmative retain without validated action-specific support')
  if (assessment && ownershipAction && !independentlySupported) throw new Error('Existing-position advice lacks independent action-specific support')
  if (result.existingPositionStance.value === 'retain' && /(?:zero (?:exposure|ownership)|no (?:exposure|ownership)|(?:sell|exit) (?:all|the entire))/i.test(result.existingPositionStance.reason)) throw new Error('Retain cannot prescribe zero exposure')
  return result
}
/** Historical reports deliberately remain legacy instead of being silently reinterpreted. */
export function readResearchAdvice(value: unknown, allowedSourceIds?: readonly string[], context?: ResearchAdviceAssessmentContext): ResearchAdvice | null {
  try { return validateResearchAdvice(value, allowedSourceIds, context) } catch { return null }
}
/** Reject the observed PL failure at the research boundary, before a
 * recommendation critic has to repair a conflicting ownership instruction. */
export function validateResearchNarrative(advice: ResearchAdvice | null, verdict: string): void {
  if (advice?.existingPositionStance.value !== 'retain') return
  const conflict = verdict.split(/[.!?\n]/).some(sentence =>
    /(?:keep|set|maintain|target|reduce)\s+(?:the\s+)?(?:position\s+(?:size|weight)|exposure|ownership|allocation)\s+(?:at|to|of)\s+0\s*%/i.test(sentence) &&
    !/new (?:entrants?|buyers?|entry|positions?)|unowned|prospective (?:buyers?|positions?)/i.test(sentence))
  if (conflict) throw new Error('Research retain stance contradicts its zero-position verdict')
}
