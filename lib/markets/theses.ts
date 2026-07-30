import type { CandidateBrief, CompanyPacket, EquityResearchNote, ThesisContent, ThesisEntityType } from './types.ts'

export function thesisEntityKey(entityType: ThesisEntityType, input: { symbol?: string; sector?: string; subIndustry?: string }): string {
  if (entityType === 'stock') return `stock:${input.symbol?.trim().toUpperCase() ?? ''}`
  return `sub-industry:${input.sector?.trim() ?? ''}:${input.subIndustry?.trim() ?? ''}`
}

export function stockThesisContent(research: EquityResearchNote): ThesisContent {
  return {
    headline: research.keyDebate,
    summary: research.mispricing,
    coreBelief: research.sections.find((section) => section.id === 'snapshot')?.content ?? research.keyDebate,
    whatChanged: `Research v${research.version} established the current evidence set and entry decision.`,
    catalysts: research.sections.find((section) => section.id === 'catalysts')?.content.split('\n').filter(Boolean).slice(0, 4) ?? [],
    invalidation: research.sections.find((section) => section.id === 'kill_criteria')?.content.split('\n').filter(Boolean).slice(0, 4) ?? [research.fastestKillSignal],
    nextQuestion: research.fastestKillSignal,
    confidence: research.confidence,
  }
}

export function industryThesisContent(briefs: CandidateBrief[]): ThesisContent | null {
  const first = briefs[0]
  if (!first) return null
  const laneLabels = [...new Set(briefs.map((brief) => brief.primaryLane.replaceAll('_', ' ')))]
  const changed = [...new Set(briefs.flatMap((brief) => brief.whatChanged))].slice(0, 4)
  const catalysts = [...new Set(briefs.map((brief) => brief.catalyst))].slice(0, 4)
  const invalidation = [...new Set(briefs.flatMap((brief) => brief.redFlags))].slice(0, 4)
  return {
    headline: `${first.subIndustry}: candidate activity requires research`,
    summary: `${first.subIndustry} produced ${briefs.length} candidate${briefs.length === 1 ? '' : 's'} across ${laneLabels.join(', ')} discovery.`,
    coreBelief: first.industryContext,
    whatChanged: changed.join(' '),
    catalysts,
    invalidation,
    nextQuestion: first.nextResearchQuestion,
    confidence: Math.min(85, 45 + briefs.length * 10),
  }
}

export function thesisSources(packet: CompanyPacket, research: EquityResearchNote) {
  const used = new Set(research.sourceIds)
  return packet.sources
    .filter((source) => used.size === 0 || used.has(source.id))
    .map(({ label, url, asOf }) => ({ label, url, asOf }))
}
