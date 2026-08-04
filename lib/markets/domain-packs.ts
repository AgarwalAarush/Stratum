import type { MarketDomainPack } from './types.ts'

/**
 * Domain packs model economic systems, not arbitrary equity sectors. Most
 * runtime behavior is declarative so every new vertical inherits the same
 * source-governance and research gates; a pack earns bespoke code only for a
 * genuinely domain-specific deterministic calculation.
 */
export const MARKET_DOMAIN_PACKS: readonly MarketDomainPack[] = [
  {
    id: 'ai-power', version: 1, label: 'AI infrastructure and power', status: 'active', parentDomainId: null,
    description: 'Data-center load, firm generation, interconnection, electrical equipment, and regional scarcity.',
    mechanisms: [
      { id: 'data_center_load', label: 'Data-center and AI load growth', required: true },
      { id: 'firm_capacity_constraint', label: 'Firm capacity response', required: true },
      { id: 'interconnection_constraint', label: 'Interconnection and permitting', required: true },
      { id: 'equipment_lead_time', label: 'Electrical equipment lead time', required: false },
      { id: 'economic_capture', label: 'Scarcity-rent capture', required: true },
    ],
    sourceRequirements: [
      { evidenceClass: 'regulatory_data', purpose: 'load, reliability, and interconnection evidence', minimumSources: 2 },
      { evidenceClass: 'operational_data', purpose: 'deliverable capacity and queue evidence', minimumSources: 1 },
      { evidenceClass: 'company_disclosure', purpose: 'capex and supplier-capture evidence', minimumSources: 2 },
      { evidenceClass: 'industry_research', purpose: 'independent constraint cross-check', minimumSources: 1 },
    ],
    entityKinds: ['company', 'technology', 'facility', 'jurisdiction', 'regulator', 'industry', 'dataset'],
  },
  {
    id: 'semicap-data-center-equipment', version: 1, label: 'Semicap and data-center equipment', status: 'candidate', parentDomainId: 'ai-power',
    description: 'Compute, networking, cooling, memory, fabrication capacity, and equipment bottlenecks.',
    mechanisms: [
      { id: 'compute_demand', label: 'Compute and networking demand', required: true },
      { id: 'fabrication_capacity', label: 'Fabrication and packaging capacity', required: true },
      { id: 'component_lead_time', label: 'Component and equipment lead time', required: true },
      { id: 'supply_chain_capture', label: 'Value-chain capture and substitution', required: true },
    ],
    sourceRequirements: [
      { evidenceClass: 'company_disclosure', purpose: 'orders, backlog, capex, and capacity', minimumSources: 3 },
      { evidenceClass: 'technical_research', purpose: 'technology and supply constraint validation', minimumSources: 1 },
      { evidenceClass: 'industry_research', purpose: 'independent cycle cross-check', minimumSources: 1 },
    ],
    entityKinds: ['company', 'technology', 'facility', 'commodity', 'jurisdiction', 'industry'],
  },
  {
    id: 'critical-materials', version: 1, label: 'Critical materials and supply chains', status: 'candidate', parentDomainId: null,
    description: 'Mine supply, processing concentration, inventories, export controls, substitution, and project lead times.',
    mechanisms: [
      { id: 'resource_supply', label: 'Mine and processing supply', required: true },
      { id: 'processing_concentration', label: 'Processing concentration', required: true },
      { id: 'trade_constraint', label: 'Trade and export constraint', required: true },
      { id: 'substitution', label: 'Substitution and demand response', required: true },
    ],
    sourceRequirements: [
      { evidenceClass: 'regulatory_data', purpose: 'trade, permit, and geological evidence', minimumSources: 2 },
      { evidenceClass: 'operational_data', purpose: 'inventory and shipment evidence', minimumSources: 1 },
      { evidenceClass: 'company_disclosure', purpose: 'project, cost, and capacity evidence', minimumSources: 2 },
    ],
    entityKinds: ['company', 'technology', 'facility', 'commodity', 'jurisdiction', 'regulator', 'industry', 'dataset'],
  },
  {
    id: 'macro-policy-geopolitics', version: 1, label: 'Macro, policy, and geopolitics', status: 'candidate', parentDomainId: null,
    description: 'Rates, fiscal policy, trade rules, security constraints, and geopolitical transmission channels.',
    mechanisms: [
      { id: 'policy_change', label: 'Policy or trade-rule change', required: true },
      { id: 'financial_conditions', label: 'Financial-conditions transmission', required: true },
      { id: 'supply_chain_disruption', label: 'Physical supply-chain disruption', required: false },
      { id: 'expectations_shift', label: 'Expectations and positioning shift', required: true },
    ],
    sourceRequirements: [
      { evidenceClass: 'regulatory_data', purpose: 'official policy and statistical releases', minimumSources: 2 },
      { evidenceClass: 'operational_data', purpose: 'cross-border and real-economy transmission evidence', minimumSources: 1 },
      { evidenceClass: 'market_expectations', purpose: 'expectations evidence, never a factual substitute', minimumSources: 1 },
    ],
    entityKinds: ['company', 'commodity', 'jurisdiction', 'regulator', 'industry', 'dataset'],
  },
] as const

export function getMarketDomainPack(id: string): MarketDomainPack | null {
  return MARKET_DOMAIN_PACKS.find((pack) => pack.id === id) ?? null
}

export function isKnownMarketDomain(id: string): boolean {
  return getMarketDomainPack(id) !== null
}
