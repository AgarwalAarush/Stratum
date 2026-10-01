import type { CompanyPacket, EtfResearchPacket } from './types.ts'
import type { DecisionContext } from './recommendations.ts'

/** Reconstruct inputs, not a cosmetic deletion of World links in old prose. */
export function primaryResearchPacket(packet: CompanyPacket | EtfResearchPacket): CompanyPacket | EtfResearchPacket {
  const clean = structuredClone(packet)
  delete clean.outcomeFeedback
  clean.sources = clean.sources.filter(s => !s.id.startsWith('feedback:'))
  if ('company' in clean) {
    delete clean.worldOrigin
    delete clean.marketTheses
    clean.existingThesis = null
    const excluded = new Set((clean.researchEvidence ?? []).filter(e => !['primary','regulatory'].includes(e.quality)).map(e => e.id))
    clean.researchEvidence = (clean.researchEvidence ?? []).filter(e => !excluded.has(e.id))
    clean.sources = clean.sources.filter(s => !excluded.has(s.id))
  }
  return clean
}
export function frozenPrimaryPacket(context: DecisionContext, symbol: string, portfolioId: string) {
  const name = context.names.find(n => n.symbol === symbol && n.portfolioId === portfolioId)
  if (!name) throw new Error('Missing frozen decision name')
  const evidence = context.evidence.find(e => name.sources.includes(e.id) && ['company_packet','etf_packet'].includes(e.kind))
  if (!evidence || !evidence.availableAt || Date.parse(evidence.availableAt) > Date.parse(context.cutoff)) throw new Error('Missing point-in-time primary packet')
  const row = evidence.value as {packet?: CompanyPacket | EtfResearchPacket}
  if (!row.packet || row.packet.symbol !== symbol || Date.parse(row.packet.generatedAt) > Date.parse(context.cutoff)) throw new Error('Invalid frozen primary packet')
  return {packet: primaryResearchPacket(row.packet), evidenceId: evidence.id, capturedAt: evidence.availableAt}
}
