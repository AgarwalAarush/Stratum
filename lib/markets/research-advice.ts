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
export const RESEARCH_ADVICE_RULES = 'Return advice.version 1 with four separately evidenced dimensions: businessView (constructive/mixed/adverse/undetermined), evidenceSufficiency (sufficient/limited/insufficient), newEntryStance (eligible/wait/avoid/undetermined), existingPositionStance (retain/reduce/exit/undetermined). Each dimension requires value, cited reason, sourceIds and observable changeConditions. Separate business opinion, evidence quality, entry timing and disposition of an existing holding. A wait or avoid for a new entry need not mean an existing holding should be exited. Retain must affirm continued positive exposure; it cannot prescribe zero ownership. If evidence is insufficient, acknowledge it with NOT_RATED and undetermined position stance rather than inventing a directional call. Legacy ratings do not determine these fields.'
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
export function validateResearchAdvice(value: unknown, allowedSourceIds?: readonly string[]): ResearchAdvice {
  const advice = object(value)
  if (advice.version !== 1) throw new Error('Missing versioned research advice')
  for (const [key, values] of Object.entries(ADVICE_VALUES)) {
    const field = object(advice[key])
    if (!(values as readonly unknown[]).includes(field.value) || typeof field.reason !== 'string' || field.reason.trim().length < 8 || !Array.isArray(field.sourceIds) || !field.sourceIds.length || field.sourceIds.some(id => typeof id !== 'string' || (allowedSourceIds && !allowedSourceIds.includes(id))) || !Array.isArray(field.changeConditions) || !field.changeConditions.length || field.changeConditions.some(c => typeof c !== 'string' || c.trim().length < 8)) throw new Error(`Invalid cited research advice: ${key}`)
  }
  const result = advice as ResearchAdvice
  if (result.evidenceSufficiency.value === 'insufficient' && (result.newEntryStance.value === 'eligible' || result.existingPositionStance.value === 'retain')) throw new Error('Insufficient evidence cannot establish eligible entry or affirmative retain')
  if (result.existingPositionStance.value === 'retain' && /(?:zero (?:exposure|ownership)|no (?:exposure|ownership)|(?:sell|exit) (?:all|the entire))/i.test(result.existingPositionStance.reason)) throw new Error('Retain cannot prescribe zero exposure')
  return result
}
/** Historical reports deliberately remain legacy instead of being silently reinterpreted. */
export function readResearchAdvice(value: unknown): ResearchAdvice | null {
  try { return validateResearchAdvice(value) } catch { return null }
}
