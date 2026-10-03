import type { ResearchCoverage } from './research-coverage.ts'

export const EVIDENCE_ACTIONS = ['buy', 'add', 'hold', 'trim', 'sell'] as const
export type EvidenceAction = typeof EVIDENCE_ACTIONS[number]
export type EvidenceAvailability = 'not_disclosed' | 'retrieval_failed' | 'not_investigated'
export interface EvidenceGap {
  id: string
  description: string
  availability: EvidenceAvailability
  /** An unresolved fact that prevents these actions; never waived by actionSupport. */
  affectedActions: EvidenceAction[]
  resolution: string
}
export interface ActionEvidenceSupport {
  action: EvidenceAction
  reason: string
  sourceIds: string[]
  /** Every assessment gap was considered, including gaps that do not prevent this action. */
  gapIds: string[]
  reversalConditions: string[]
}
export type ActionSupport = ActionEvidenceSupport
export interface EvidenceAssessment { version: 1; gaps: EvidenceGap[]; actionSupport: ActionEvidenceSupport[] }
export interface RequiredEvidenceGap { id: string; description: string; availability?: EvidenceAvailability }

const object = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {}
const nonempty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0
const uniqueStrings = (v: unknown): v is string[] => Array.isArray(v) && v.every(nonempty) && new Set(v).size === v.length

/** Stable IDs bind the generated assessment to independently collected omissions. */
export function requiredEvidenceGaps(packet: {evidenceQuality?: {missing?: string[]}; researchCoverage?: ResearchCoverage}): RequiredEvidenceGap[] {
  const gaps: RequiredEvidenceGap[] = [...new Set(packet.evidenceQuality?.missing ?? [])].map(description => ({id: `packet:${description}`, description}))
  const coverage = packet.researchCoverage
  if (coverage?.status === 'failed') gaps.push({id: 'coverage:collection_failed', description: 'Company background evidence collection failed', availability: 'retrieval_failed'})
  if (coverage && coverage.topics.length < 3) gaps.push({id: 'coverage:topic_discovery_incomplete', description: 'Company background topic discovery is incomplete', availability: 'not_investigated'})
  for (const topic of coverage?.topics ?? []) {
    if (topic.decisive && (!topic.sourceIds.length || topic.unresolvedQuestions.length)) {
      gaps.push({id: `topic:${topic.id}`, description: `${topic.title}: ${topic.unresolvedQuestions.join('; ') || 'No readable supporting evidence collected'}`})
    }
  }
  return gaps
}

export function validateEvidenceAssessment(value: unknown, allowedSourceIds?: readonly string[], requiredGaps: readonly RequiredEvidenceGap[] = []): EvidenceAssessment {
  const v = object(value)
  if (v.version !== 1 || !Array.isArray(v.gaps) || !Array.isArray(v.actionSupport)) throw new Error('Missing versioned action-specific evidence assessment')
  const gaps = v.gaps.map(raw => {
    const gap = object(raw)
    if (!nonempty(gap.id) || !nonempty(gap.description) || !['not_disclosed', 'retrieval_failed', 'not_investigated'].includes(String(gap.availability)) || !Array.isArray(gap.affectedActions) || new Set(gap.affectedActions).size !== gap.affectedActions.length || gap.affectedActions.some(a => !EVIDENCE_ACTIONS.includes(a as EvidenceAction)) || !nonempty(gap.resolution)) throw new Error('Invalid action-specific evidence gap')
    return gap as unknown as EvidenceGap
  })
  const gapIds = gaps.map(g => g.id)
  if (new Set(gapIds).size !== gapIds.length) throw new Error('Evidence gap IDs must be unique')
  for (const required of requiredGaps) {
    const gap = gaps.find(g => g.id === required.id)
    if (!gap) throw new Error(`Evidence assessment omits known gap: ${required.id}`)
    if (required.availability && gap.availability !== required.availability) throw new Error(`Evidence gap misstates collection status: ${required.id}`)
  }
  const actionSupport = v.actionSupport.map(raw => {
    const support = object(raw)
    if (!EVIDENCE_ACTIONS.includes(support.action as EvidenceAction) || !nonempty(support.reason) || !uniqueStrings(support.sourceIds) || !support.sourceIds.length || support.sourceIds.some(id => allowedSourceIds && !allowedSourceIds.includes(id)) || !uniqueStrings(support.gapIds) || support.gapIds.length !== gapIds.length || support.gapIds.some(id => !gapIds.includes(id)) || !uniqueStrings(support.reversalConditions) || !support.reversalConditions.length) throw new Error('Action support needs actual citations, every reviewed gap and observable reversal conditions')
    if (gaps.some(g => g.affectedActions.includes(support.action as EvidenceAction))) throw new Error(`Supported action is blocked by its recorded evidence gap: ${support.action}`)
    return support as unknown as ActionEvidenceSupport
  })
  if (new Set(actionSupport.map(s => s.action)).size !== actionSupport.length) throw new Error('Supported actions must be unique')
  return {version: 1, gaps, actionSupport}
}

/** Historical reports remain unassessed if structured validation fails. */
export function readEvidenceAssessment(value: unknown, allowedSourceIds?: readonly string[]): EvidenceAssessment | null {
  try { return validateEvidenceAssessment(value, allowedSourceIds) } catch { return null }
}
