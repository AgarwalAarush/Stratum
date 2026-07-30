import type { CompanyPacket, EquityResearchNote, ThesisContent, ThesisEntityType } from './types.ts'

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function cleanResearchLine(value: string): string {
  return value
    .replace(/^\s*[-*]\s+/, '')
    .replace(/^\*{0,2}(?:FACT|CONSENSUS|VIEW|ESTIMATE):\s*/i, '')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function evidenceItems(values: string[]): string[] {
  const bullets = values.filter((value) => /^\s*[-*]\s+/.test(value))
  return (bullets.length > 0 ? bullets : values).map(cleanResearchLine).filter(Boolean).slice(0, 4)
}

function sectionItems(value: string | undefined): string[] {
  return evidenceItems(value?.split('\n').filter(Boolean) ?? [])
}

function cleanStatement(value: string): string {
  const firstParagraph = value.split(/\n\s*\n/, 1)[0] ?? value
  const cleaned = firstParagraph
    .replace(/\*\*(?:FACT|CONSENSUS|VIEW|ESTIMATE):\*\*/gi, '')
    .replace(/^\*{0,2}(?:FACT|CONSENSUS|VIEW|ESTIMATE):\s*/i, '')
    .replace(/^[#>*\s-]+/, '')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^(?:BUY|HOLD|SELL|NOT_RATED)\s*[;—-]\s*(?:(?:buy|wait|nibble|add|avoid)\b[^.!]*[.!]\s*)?/i, '')
    .replace(/\s+(?:The|Our) practical action is\b.*$/i, '')
    .trim()
  return cleaned.slice(0, 520).trim()
}

function isQuestionLike(value: string): boolean {
  return value.trim().endsWith('?')
    || /^(?:whether|can|could|will|would|does|do|is|are|should|how|what|when|why)\b/i.test(value.trim())
}

function isResearchPlaceholder(value: string): boolean {
  return /(?:candidate activity|leadership) requires research/i.test(value)
}

export function normalizeThesisContent(value: unknown): ThesisContent {
  const item = record(value)
  const rawHeadline = String(item.headline ?? '')
  const rawCoreBelief = String(item.coreBelief ?? '')
  const summary = String(item.summary ?? item.mispricing ?? '')
  const legacyQuestion = isQuestionLike(rawHeadline) ? rawHeadline : ''
  const legacyPlaceholder = isResearchPlaceholder(rawHeadline)
  const coreBelief = !isQuestionLike(rawCoreBelief) && !isResearchPlaceholder(rawCoreBelief)
    ? rawCoreBelief
    : ''
  const statement = String(item.investmentThesis ?? item.statement ?? (
    legacyQuestion || legacyPlaceholder ? coreBelief || summary : rawHeadline || coreBelief || summary
  ))
  const invalidation = evidenceItems(stringArray(item.invalidation))
  const legacyNext = String(item.nextQuestion ?? '')
  const legacyNextIsDebate = isQuestionLike(legacyNext)
  return {
    headline: cleanStatement(statement),
    summary,
    coreBelief: cleanStatement(coreBelief || statement),
    keyDebate: String(item.keyDebate || legacyQuestion || (legacyNextIsDebate ? legacyNext : '')),
    whatChanged: String(item.whatChanged ?? ''),
    catalysts: evidenceItems(stringArray(item.catalysts)),
    invalidation,
    fastestKillSignal: String(item.fastestKillSignal || (
      legacyNextIsDebate ? invalidation[0] : legacyNext
    ) || invalidation[0] || ''),
    confidence: Math.max(0, Math.min(100, Number(item.confidence ?? 0))),
  }
}

export function thesisEntityKey(entityType: ThesisEntityType, input: { symbol?: string; sector?: string; subIndustry?: string }): string {
  if (entityType === 'stock') return `stock:${input.symbol?.trim().toUpperCase() ?? ''}`
  return `sub-industry:${input.sector?.trim() ?? ''}:${input.subIndustry?.trim() ?? ''}`
}

export function stockThesisContent(research: EquityResearchNote): ThesisContent {
  const investmentThesis = cleanStatement(research.investmentThesis)
  const catalysts = sectionItems(research.sections.find((section) => section.id === 'catalysts')?.content)
  const invalidation = sectionItems(research.sections.find((section) => section.id === 'kill_criteria')?.content)
  return {
    headline: investmentThesis,
    summary: research.mispricing,
    coreBelief: investmentThesis,
    keyDebate: research.keyDebate,
    whatChanged: `Research v${research.version} established the current evidence set and entry decision.`,
    catalysts,
    invalidation: invalidation.length > 0 ? invalidation : [research.fastestKillSignal],
    fastestKillSignal: research.fastestKillSignal,
    confidence: research.confidence,
  }
}

export function thesisSources(packet: CompanyPacket, research: EquityResearchNote) {
  const used = new Set(research.sourceIds)
  return packet.sources
    .filter((source) => used.size === 0 || used.has(source.id))
    .map(({ label, url, asOf }) => ({ label, url, asOf }))
}
