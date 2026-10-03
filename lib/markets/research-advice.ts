import { DECISION_SUPPORT_RULES, validateDecisionSupport, type DecisionSupport } from './research-contract.ts'
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
export type ResearchAdvice = { version: 1 | 2; decisionSupport?: DecisionSupport } & { [K in keyof typeof ADVICE_VALUES]: AdviceDimension<K> }
export const RESEARCH_ADVICE_RULES = DECISION_SUPPORT_RULES + ' Return four separately evidenced dimensions: businessView (constructive/mixed/adverse/undetermined), evidenceSufficiency (sufficient/limited/insufficient), newEntryStance (eligible/wait/avoid/undetermined), existingPositionStance (retain/reduce/exit/undetermined). Each dimension requires value, cited reason, sourceIds and observable changeConditions. Overall evidence completeness does not replace the independently justified actionSupport decision. Legacy ratings do not determine these fields.'

const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
export function validateResearchAdvice(value: unknown, allowedSourceIds?: readonly string[]): ResearchAdvice {
  const advice = object(value)
  if (![1, 2].includes(Number(advice.version))) throw new Error('Missing versioned research advice')
  for (const [key, values] of Object.entries(ADVICE_VALUES)) {
    const field = object(advice[key])
    if (!(values as readonly unknown[]).includes(field.value) || typeof field.reason !== 'string' || field.reason.trim().length < 8 || !Array.isArray(field.sourceIds) || !field.sourceIds.length || field.sourceIds.some(id => typeof id !== 'string' || (allowedSourceIds && !allowedSourceIds.includes(id))) || !Array.isArray(field.changeConditions) || !field.changeConditions.length || field.changeConditions.some(c => typeof c !== 'string' || c.trim().length < 8)) throw new Error(`Invalid cited research advice: ${key}`)
  }
  const result = advice as ResearchAdvice
  if (result.version === 2) {
    result.decisionSupport = validateDecisionSupport(advice.decisionSupport, allowedSourceIds)
    const support = result.decisionSupport.actionSupport
    if (result.existingPositionStance.value === 'retain' && support.hold.status !== 'supported' || result.existingPositionStance.value === 'reduce' && support.trim.status !== 'supported' || result.existingPositionStance.value === 'exit' && support.sell.status !== 'supported' || result.newEntryStance.value === 'eligible' && support.buy.status !== 'supported' && support.add.status !== 'supported') throw new Error('Research stance lacks action-specific support')
  }
  if (result.version === 1 && result.evidenceSufficiency.value === 'insufficient' && (result.newEntryStance.value === 'eligible' || result.existingPositionStance.value === 'retain')) throw new Error('Insufficient evidence cannot establish eligible entry or affirmative retain')
  if (result.existingPositionStance.value === 'retain' && /(?:zero (?:exposure|ownership)|no (?:exposure|ownership)|(?:sell|exit) (?:all|the entire))/i.test(result.existingPositionStance.reason)) throw new Error('Retain cannot prescribe zero exposure')
  return result
}
/** Historical reports deliberately remain legacy instead of being silently reinterpreted. */
export function readResearchAdvice(value: unknown): ResearchAdvice | null {
  try { return validateResearchAdvice(value) } catch { return null }
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
