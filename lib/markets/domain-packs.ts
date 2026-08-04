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
    hypothesisTemplate: {
      title: 'AI-driven firm-power scarcity may create regional scarcity rents', horizon: '1–5 years',
      coreMechanism: 'Data-center load growth collides with slow firm-capacity, interconnection, and equipment response.',
      counterThesis: 'Efficiency gains, flexible load, generation overbuild, grid reform, or lower AI capital spending could eliminate scarcity before it produces durable rents.',
      causalGraph: [
        { from: 'Data-center and AI load growth', to: 'Regional firm-power demand', mechanism: 'data_center_load', core: true },
        { from: 'Slow firm generation additions', to: 'Regional firm-power scarcity', mechanism: 'firm_capacity_constraint', core: true },
        { from: 'Interconnection delays', to: 'Delayed load-serving capacity', mechanism: 'interconnection_constraint', core: true },
        { from: 'Equipment lead times', to: 'Slow capacity response', mechanism: 'equipment_lead_time', core: false },
        { from: 'Regional firm-power scarcity', to: 'Scarcity rents for proven supply and enabling equipment', mechanism: 'economic_capture', core: true },
      ],
    },
    crossDomainLinks: [{
      id: 'ai-compute-to-semicap-demand', toDomainId: 'semicap-data-center-equipment', relationship: 'amplifies',
      fromMechanisms: ['data_center_load'], toMechanisms: ['compute_demand'],
      explanation: 'AI and data-center build-out can jointly raise compute-system demand and regional electricity load; the connection is a transmission hypothesis, not proof that either value chain captures economics.',
    }],
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
      { evidenceClass: 'regulatory_data', purpose: 'trade and policy transmission evidence', minimumSources: 1 },
    ],
    entityKinds: ['company', 'technology', 'facility', 'commodity', 'jurisdiction', 'industry'],
    hypothesisTemplate: {
      title: 'AI build-out may leave specialized compute supply-chain bottlenecks durable longer than expected', horizon: '1–4 years',
      coreMechanism: 'Compute demand, fabrication capacity, component lead times, and substitution determine whether suppliers retain scarcity rents.',
      counterThesis: 'Demand normalizes, capacity expands faster than expected, architectures substitute away from constrained components, or customers internalize supply.',
      causalGraph: [
        { from: 'Compute and networking demand', to: 'Specialized component demand', mechanism: 'compute_demand', core: true },
        { from: 'Fabrication and packaging capacity', to: 'Deliverable component supply', mechanism: 'fabrication_capacity', core: true },
        { from: 'Component and equipment lead times', to: 'Delayed supply response', mechanism: 'component_lead_time', core: true },
        { from: 'Delayed supply response', to: 'Supplier scarcity rents', mechanism: 'supply_chain_capture', core: true },
        { from: 'Supplier scarcity rents', to: 'Value-chain exposure candidates', mechanism: 'economic_capture', core: true },
      ],
    },
    crossDomainLinks: [{
      id: 'semicap-equipment-to-power-buildout', toDomainId: 'ai-power', relationship: 'constrains',
      fromMechanisms: ['component_lead_time'], toMechanisms: ['equipment_lead_time'],
      explanation: 'Specialized equipment constraints can interact with electrical-equipment availability, but each domain retains its own evidence and falsifiers.',
    }],
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
    hypothesisTemplate: {
      title: 'Critical-material supply constraints may persist through processing concentration and slow project response', horizon: '2–7 years',
      coreMechanism: 'Resource supply, processing concentration, trade constraints, and substitution determine whether material scarcity becomes durable economics.',
      counterThesis: 'Inventories, substitution, recycling, new supply, or policy coordination resolve the constraint before rents persist.',
      causalGraph: [
        { from: 'Mine and processing supply', to: 'Available material supply', mechanism: 'resource_supply', core: true },
        { from: 'Processing concentration', to: 'Fragile supply response', mechanism: 'processing_concentration', core: true },
        { from: 'Trade and export constraints', to: 'Regional availability shock', mechanism: 'trade_constraint', core: true },
        { from: 'Substitution and demand response', to: 'Constraint durability', mechanism: 'substitution', core: true },
        { from: 'Constraint durability', to: 'Scarcity-rent capture candidates', mechanism: 'economic_capture', core: true },
      ],
    },
    crossDomainLinks: [{
      id: 'materials-to-semicap-supply', toDomainId: 'semicap-data-center-equipment', relationship: 'constrains',
      fromMechanisms: ['processing_concentration', 'trade_constraint'], toMechanisms: ['fabrication_capacity', 'component_lead_time'],
      explanation: 'Material processing and trade constraints may restrict semiconductor supply response; the link requires evidence on both sides before it is active.',
    }],
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
    hypothesisTemplate: {
      title: 'Macro and policy changes may transmit unevenly through financial conditions and physical supply chains', horizon: '6–36 months',
      coreMechanism: 'Policy change, financial conditions, supply disruption, and expectations jointly determine the economic transmission rather than a headline alone.',
      counterThesis: 'Policy implementation differs from announcement, financial conditions offset the action, supply chains adapt, or expectations already discount the outcome.',
      causalGraph: [
        { from: 'Policy or trade-rule change', to: 'Financial and operating conditions', mechanism: 'policy_change', core: true },
        { from: 'Financial-conditions transmission', to: 'Funding and demand response', mechanism: 'financial_conditions', core: true },
        { from: 'Physical supply-chain disruption', to: 'Availability and cost pressure', mechanism: 'supply_chain_disruption', core: false },
        { from: 'Expectations and positioning shift', to: 'Market-implied transmission', mechanism: 'expectations_shift', core: true },
        { from: 'Market-implied transmission', to: 'Exposure candidates', mechanism: 'economic_capture', core: true },
      ],
    },
    crossDomainLinks: [
      { id: 'policy-to-semicap-transmission', toDomainId: 'semicap-data-center-equipment', relationship: 'transmits', fromMechanisms: ['policy_change'], toMechanisms: ['supply_chain_capture'], explanation: 'Policy can transmit into semiconductor allocation and economics, but a policy announcement alone never establishes the downstream outcome.' },
      { id: 'policy-to-materials-transmission', toDomainId: 'critical-materials', relationship: 'transmits', fromMechanisms: ['policy_change', 'supply_chain_disruption'], toMechanisms: ['trade_constraint'], explanation: 'Policy and geopolitical changes can transmit into materials trade constraints only when both the action and physical response are evidenced.' },
    ],
  },
  {
    id: 'industrial-automation', version: 1, label: 'Industrial automation and robotics', status: 'candidate', parentDomainId: null,
    description: 'Labor constraints, automation capex, deployment bottlenecks, realized productivity, and value-chain capture.',
    mechanisms: [
      { id: 'labor_constraint', label: 'Labor availability and cost pressure', required: true },
      { id: 'automation_capex', label: 'Automation and robotics capital spending', required: true },
      { id: 'deployment_bottleneck', label: 'Integration, controls, and deployment bottleneck', required: true },
      { id: 'productivity_realization', label: 'Realized productivity and utilization', required: true },
      { id: 'economic_capture', label: 'Value-chain capture and substitution', required: true },
    ],
    sourceRequirements: [
      { evidenceClass: 'regulatory_data', purpose: 'labor, productivity, and manufacturing activity evidence', minimumSources: 1 },
      { evidenceClass: 'operational_data', purpose: 'deployment, utilization, and order-flow evidence', minimumSources: 1 },
      { evidenceClass: 'company_disclosure', purpose: 'automation capex, backlog, and deployment evidence', minimumSources: 2 },
      { evidenceClass: 'industry_research', purpose: 'independent technology and adoption cross-check', minimumSources: 1 },
    ],
    entityKinds: ['company', 'technology', 'facility', 'jurisdiction', 'regulator', 'industry', 'dataset'],
    hypothesisTemplate: {
      title: 'Persistent labor and throughput constraints may raise the value of deployable industrial automation', horizon: '1–5 years',
      coreMechanism: 'Labor pressure and automation capex create value only when controls, integration, and customer utilization turn installed equipment into sustained productivity.',
      counterThesis: 'Labor pressure eases, adoption stalls at integration complexity, equipment commoditizes, or customers fail to realize the expected productivity gains.',
      causalGraph: [
        { from: 'Labor availability and cost pressure', to: 'Automation payback pressure', mechanism: 'labor_constraint', core: true },
        { from: 'Automation and robotics capital spending', to: 'Installed automation base', mechanism: 'automation_capex', core: true },
        { from: 'Integration, controls, and deployment bottleneck', to: 'Delayed productive deployment', mechanism: 'deployment_bottleneck', core: true },
        { from: 'Realized productivity and utilization', to: 'Customer willingness to sustain adoption', mechanism: 'productivity_realization', core: true },
        { from: 'Customer willingness to sustain adoption', to: 'Automation value-chain capture candidates', mechanism: 'economic_capture', core: true },
      ],
    },
    crossDomainLinks: [{
      id: 'industrial-automation-to-semicap-demand', toDomainId: 'semicap-data-center-equipment', relationship: 'amplifies',
      fromMechanisms: ['automation_capex'], toMechanisms: ['compute_demand'],
      explanation: 'Industrial automation investment can raise demand for compute, control, sensing, and networking components, but the transmission requires evidence from both value chains before it is active.',
    }],
  },
] as const

export function getMarketDomainPack(id: string): MarketDomainPack | null {
  return MARKET_DOMAIN_PACKS.find((pack) => pack.id === id) ?? null
}

export function isKnownMarketDomain(id: string): boolean {
  return getMarketDomainPack(id) !== null
}
