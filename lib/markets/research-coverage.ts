import type { GenerationMetadata } from '../ai/config.ts'
import type { CompanyPacket, EquityResearchSection } from './types.ts'
import type { ResearchAdvice } from './research-advice.ts'

export interface ResearchDocument {
  sourceId: string; url: string; publishedAt: string | null; capturedAt: string
  extractionStatus: 'readable' | 'failed'; contentHash: string | null
  text: string | null; error: string | null; quality: 'primary' | 'regulatory' | 'independent'
}
/** Only durable evidence fields enter a packet; HTML navigation links are collector internals. */
export function researchDocumentEvidence(d: ResearchDocument): ResearchDocument {
  return {sourceId:d.sourceId,url:d.url,publishedAt:d.publishedAt,capturedAt:d.capturedAt,extractionStatus:d.extractionStatus,contentHash:d.contentHash,text:d.text,error:d.error,quality:d.quality}
}
export interface ResearchCoverageTopic {
  id: string; title: string; importance: string; decisive: boolean
  sourceIds: string[]; quotes: Array<{sourceId: string; quote: string}>; unresolvedQuestions: string[]
}
export interface ResearchCoverage {
  version: 1; status: 'complete' | 'partial' | 'failed'; topics: ResearchCoverageTopic[]
  documents: ResearchDocument[]; attempts: number; durationMs: number
  generation: GenerationMetadata[]; errors: string[]
}
export interface ResearchCoverageDiagnostics {
  status: ResearchCoverage['status']; captured: number; failed: number
  unresolvedTopicIds: string[]; attempts: number; durationMs: number
}
export function researchCoverageDiagnostics(coverage: ResearchCoverage): ResearchCoverageDiagnostics {
  return {status:coverage.status,captured:coverage.documents.filter(d=>d.extractionStatus==='readable').length,failed:coverage.documents.filter(d=>d.extractionStatus==='failed').length,unresolvedTopicIds:coverage.topics.filter(t=>t.unresolvedQuestions.length).map(t=>t.id),attempts:coverage.attempts,durationMs:coverage.durationMs}
}
export interface ResearchCoverageReview {
  version: 1
  topics: Array<{topicId: string; status: 'addressed' | 'unresolved'; sectionIds: string[]; sourceIds: string[]; investmentImplication: string; limitations: string}>
  actionJustifications: {hold: string | null; trim: string | null; sell: string | null}
}
export const RESEARCH_COVERAGE_RULES = 'Address every researchCoverage topic in coverageReview.version 1, mapping it to substantive report sections, supporting readable source IDs, its investment implication and remaining limitations. Treat absent evidence as not established in our sources, never proof that a product, customer or business does not exist. Separate commercial deployment, adoption and reception, safe operational scaling, unit economics and valuation. A discovery headline is not evidence. If any decisive topic remains unresolved, or collection failed, evidenceSufficiency cannot be sufficient and newEntryStance cannot be eligible. Independently supported retain/reduce/exit advice may remain useful only with cited evidence and an explicit actionJustifications explanation of why each decisive gap does not undermine that particular stance. Never silently assume unresolved economics are adverse. Prior reports cannot determine the independent topic list.'
const obj = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {}
export const normalizedEvidenceText = (text: string) => text.normalize('NFKC').replace(/\s+/g, ' ').trim()

/** Structured provider data is readable; linked-only filings/events are not. */
export function readableCompanySourceIds(packet: CompanyPacket): string[] {
  const unreadable = new Set([
    ...packet.filings.filter(f => !f.excerpt).map(f => packet.sources.find(s => s.url === f.url)?.id),
    ...packet.events.map(e => packet.sources.find(s => s.url === e.url)?.id),
    ...(packet.researchEvidence ?? []).filter(e => !e.excerpt || e.quality === 'discovery').map(e => e.id),
    ...(packet.researchDocuments ?? []).filter(d => d.extractionStatus !== 'readable').map(d => d.sourceId),
    ...(packet.researchCoverage?.documents ?? []).filter(d => d.extractionStatus !== 'readable').map(d => d.sourceId),
  ])
  return packet.sources.filter(s => !unreadable.has(s.id)).map(s => s.id)
}

export function hasDecisiveCoverageGap(coverage: ResearchCoverage): boolean {
  return coverage.status === 'failed' || coverage.topics.length < 3 || coverage.topics.some(t => t.decisive && (!t.sourceIds.length || t.unresolvedQuestions.length > 0))
}

export function validateCoverageReview(value: unknown, coverage: ResearchCoverage, sections: EquityResearchSection[], cited: string[], advice?: ResearchAdvice | null): ResearchCoverageReview {
  const v = obj(value), rows = Array.isArray(v.topics) ? v.topics.map(obj) : []
  if (v.version !== 1 || rows.length !== coverage.topics.length || new Set(rows.map(r => r.topicId)).size !== rows.length) throw new Error('Coverage review must address every material topic exactly once')
  const readable = new Set(coverage.documents.filter(d => d.extractionStatus === 'readable' && d.text).map(d => d.sourceId))
  for (const topic of coverage.topics) {
    const r = rows.find(r => r.topicId === topic.id)
    if (!r || !['addressed','unresolved'].includes(String(r.status)) || typeof r.investmentImplication !== 'string' || r.investmentImplication.trim().length < 20 || typeof r.limitations !== 'string' || !Array.isArray(r.sectionIds) || !r.sectionIds.length || !Array.isArray(r.sourceIds)) throw new Error(`Missing substantive coverage review: ${topic.title}`)
    if (r.sectionIds.some(id => !sections.some(s => s.id === id && s.content.trim().length >= 20))) throw new Error('Coverage review maps to a missing report section')
    if (r.sourceIds.some(id => !cited.includes(String(id)) || !topic.sourceIds.includes(String(id)) || !readable.has(String(id)))) throw new Error('Coverage review cites unreadable or unrelated topic evidence')
    if (r.status === 'addressed' && (!r.sourceIds.length || !topic.sourceIds.length)) throw new Error('Addressed topic requires captured evidence')
    if ((topic.unresolvedQuestions.length || !topic.sourceIds.length) && r.limitations.trim().length < 20) throw new Error('Unresolved coverage needs explicit limitations')
    if (r.sourceIds.some(id => !(r.sectionIds as string[]).some(sectionId => sections.find(s => s.id === sectionId)?.sourceIds.includes(String(id))))) throw new Error('Coverage evidence must be used by its mapped report sections')
  }
  const justifications = obj(v.actionJustifications)
  if (hasDecisiveCoverageGap(coverage)) {
    if (advice?.evidenceSufficiency.value === 'sufficient' || advice?.newEntryStance.value === 'eligible') throw new Error('Decisive coverage gaps cannot support sufficient evidence or new risk')
    const action = advice?.existingPositionStance.value === 'retain' ? 'hold' : advice?.existingPositionStance.value === 'reduce' ? 'trim' : advice?.existingPositionStance.value === 'exit' ? 'sell' : null
    if (action && (typeof justifications[action] !== 'string' || String(justifications[action]).trim().length < 40)) throw new Error('Existing-position advice needs an explicit independent coverage-gap justification')
  }
  return value as ResearchCoverageReview
}
