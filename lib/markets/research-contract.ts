export const ADVICE_VALUES = {
  businessView: ['constructive', 'mixed', 'adverse', 'undetermined'],
  evidenceSufficiency: ['sufficient', 'limited', 'insufficient'],
  newEntryStance: ['eligible', 'wait', 'avoid', 'undetermined'],
  existingPositionStance: ['retain', 'reduce', 'exit', 'undetermined'],
} as const
/** One version governs generation, upgrades and action review. Historical advice stays immutable. */
export const RESEARCH_CONTRACT_VERSION = 2
export const CAPITAL_ACTIONS = ['buy', 'add', 'hold', 'trim', 'sell'] as const
export type CapitalAction = typeof CAPITAL_ACTIONS[number]
export type EvidenceGap = {
  id: string
  question: string
  kind: 'missing_fact' | 'capture_failure' | 'undisclosed_metric' | 'future_uncertainty'
  dataKeys: string[]
  blockingActions: CapitalAction[]
  sourceIds: string[]
  followUp: { trigger: string; nextCheckAt: string | null }
}
export type ActionSupport = {
  status: 'supported' | 'unresolved'
  reason: string
  sourceIds: string[]
  reviewedGapIds: string[]
  reversalConditions: string[]
}
export type DecisionSupport = {
  evidenceGaps: EvidenceGap[]
  actionSupport: Record<CapitalAction, ActionSupport>
  scenarios: Array<{ name: 'base' | 'downside' | 'upside'; assumptions: string; implication: string; sourceIds: string[] }>
  followUp: { trigger: string; nextCheckAt: string | null }
}
const object = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {}
const text = (v: unknown, min = 8) => typeof v === 'string' && v.trim().length >= min
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === 'string')
export function validateAdviceDimensions(advice:Record<string,unknown>,allowedSourceIds?:readonly string[]):void {
  for(const [key,values] of Object.entries(ADVICE_VALUES)){
    const field=object(advice[key]);
    if(!(values as readonly unknown[]).includes(field.value)||!text(field.reason)||!strings(field.sourceIds)||!field.sourceIds.length||field.sourceIds.some(id=>allowedSourceIds&&!allowedSourceIds.includes(id))||!strings(field.changeConditions)||!field.changeConditions.length||field.changeConditions.some(condition=>!text(condition)))throw new Error(`Invalid cited research advice: ${key}`)
  }
}
export function validateDecisionSupport(value: unknown, allowedSourceIds?: readonly string[]): DecisionSupport {
  const v = object(value)
  const citations = (ids: unknown, required = false) => strings(ids) && (!required || ids.length > 0) && ids.every(id => !allowedSourceIds || allowedSourceIds.includes(id))
  const followUp = (raw: unknown) => { const f = object(raw); return text(f.trigger) && (f.nextCheckAt === null || typeof f.nextCheckAt === 'string' && Number.isFinite(Date.parse(f.nextCheckAt))) }
  if (!Array.isArray(v.evidenceGaps) || !Array.isArray(v.scenarios) || !followUp(v.followUp)) throw new Error('Research contract requires evidence gaps, scenarios and a follow-up')
  const gaps = v.evidenceGaps.map(object)
  if (new Set(gaps.map(g => g.id)).size !== gaps.length) throw new Error('Duplicate evidence gap')
  for (const g of gaps) {
    if (!text(g.id, 3) || !text(g.question) || !['missing_fact','capture_failure','undisclosed_metric','future_uncertainty'].includes(String(g.kind)) || !strings(g.dataKeys) || !Array.isArray(g.blockingActions) || g.blockingActions.some(a => !CAPITAL_ACTIONS.includes(a as CapitalAction)) || !citations(g.sourceIds) || !followUp(g.followUp)) throw new Error('Invalid structured evidence gap')
  }
  if (v.scenarios.length < 2 || v.scenarios.length > 3 || new Set(v.scenarios.map(s => object(s).name)).size !== v.scenarios.length || !v.scenarios.some(s => object(s).name === 'base') || !v.scenarios.some(s => object(s).name === 'downside')) throw new Error('Research requires distinct base and downside scenarios')
  for (const raw of v.scenarios) { const s = object(raw); if (!['base','downside','upside'].includes(String(s.name)) || !text(s.assumptions) || !text(s.implication) || !citations(s.sourceIds, true)) throw new Error('Unsupported research scenario') }
  for (const action of CAPITAL_ACTIONS) {
    const s = object(object(v.actionSupport)[action])
    if (!['supported','unresolved'].includes(String(s.status)) || !text(s.reason, 40) || !citations(s.sourceIds, true) || !strings(s.reviewedGapIds) || s.reviewedGapIds.some(id => !gaps.some(g => g.id === id)) || !strings(s.reversalConditions) || !s.reversalConditions.length || s.reversalConditions.some(c => !text(c))) throw new Error(`Invalid action support: ${action}`)
    if (s.status === 'supported' && (gaps.some(g => (g.blockingActions as unknown[]).includes(action)) || gaps.some(g => !(s.reviewedGapIds as string[]).includes(String(g.id))))) throw new Error(`Supported ${action} must independently review every gap and have no essential blocker`)
  }
  return value as DecisionSupport
}
export function hasCurrentResearchContract(content: unknown): boolean {
  const c = object(content), advice = object(c.advice ?? c)
  if (advice.version !== RESEARCH_CONTRACT_VERSION) return false
  try {
    validateAdviceDimensions(advice);
    const support=validateDecisionSupport(advice.decisionSupport).actionSupport;
    const stance=String(object(advice.existingPositionStance).value),entry=String(object(advice.newEntryStance).value);
    return !(stance==='retain'&&support.hold.status!=='supported'||stance==='reduce'&&support.trim.status!=='supported'||stance==='exit'&&support.sell.status!=='supported'||entry==='eligible'&&support.buy.status!=='supported'&&support.add.status!=='supported');
  } catch { return false }
}
/** A model cannot omit an input limitation to make an action pass. */
export function validatePacketDecisionSupport(advice: unknown, missing: readonly string[], topics: Array<{id: string; unresolvedQuestions: string[]; sourceIds: string[]}> = []): void {
  const a = object(advice)
  if (a.version !== 2) return
  const support = validateDecisionSupport(a.decisionSupport)
  for (const key of [...missing, ...topics.filter(t => t.unresolvedQuestions.length || !t.sourceIds.length).map(t => `topic:${t.id}`)]) {
    if (!support.evidenceGaps.some(g => g.dataKeys.includes(key))) throw new Error(`Research omitted input limitation: ${key}`)
  }
}
export const DECISION_SUPPORT_RULES = 'Research contract 2: return advice.version 2 and decisionSupport. Separate overall evidence completeness from support for each buy/add/hold/trim/sell action. Record every packet evidenceQuality.missing component in evidenceGaps.dataKeys using its exact name, and every unresolved researchCoverage topic as a structured gap with dataKeys containing topic:<topic ID>. Include its unresolved questions in the gap explanation. Distinguish missing_fact, capture_failure, undisclosed_metric and future_uncertainty. Specify which actions actually depend on the missing fact; ordinary future uncertainty is expressed in sourced base/downside scenarios, not automatically a blocker. Never assume an unavailable fact to support an action. Each supported action needs cited affirmative grounds, a substantive explanation addressing every gap (reviewedGapIds), and observable reversalConditions. Hold preserves current exposure; trim needs a case for reduction; sell needs a case for complete exit. Financial ratings alone do not authorize or prohibit these actions. A retain stance can be supported despite insufficient evidence for adding. Set newEntryStance eligible only if buy or add is supported. Set retain/reduce/exit only if the corresponding hold/trim/sell is supported. Every unresolved action needs a specific question and followUp trigger, with nextCheckAt a known date or null for an observable event. Use only captured source IDs; scenarios are explicitly assumptions, not established outcomes. Do not fabricate data or probabilities.'
