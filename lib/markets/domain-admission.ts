import type {
  MarketDomainDecisionCoverage,
  MarketDomainPack,
  MarketResearchFrontierItem,
  WorldSourceEvidenceClass,
} from './types.ts'

export interface DomainAdmissionCriterion {
  id: 'economic_mechanism' | 'source_contract' | 'cross_domain_links' | 'decision_relevance' | 'maintenance_owner' | 'economic_capture'
  label: string
  passed: boolean
  explanation: string
}

export interface DomainAdmissionAssessment {
  passed: boolean
  criteria: DomainAdmissionCriterion[]
}

export function evaluateDomainAdmission(input: {
  domain: MarketDomainPack
  sourceCoverage: Array<{ evidenceClass: WorldSourceEvidenceClass; current: number; required: number }>
  maintenanceOwner: string
}): DomainAdmissionAssessment {
  const domain = input.domain
  const missing = input.sourceCoverage.filter((item) => item.current < item.required)
  const criteria: DomainAdmissionCriterion[] = [
    {
      id: 'economic_mechanism', label: 'Economic mechanism',
      passed: domain.admission.economicMechanism.trim().length >= 20 && domain.mechanisms.some((item) => item.required),
      explanation: domain.admission.economicMechanism,
    },
    {
      id: 'source_contract', label: 'Governed source requirements',
      passed: missing.length === 0,
      explanation: missing.length === 0 ? 'Every declared source class has contract-bounded coverage.' : `Missing ${missing.map((item) => `${item.evidenceClass} ${item.current}/${item.required}`).join(', ')}.`,
    },
    {
      id: 'cross_domain_links', label: 'Cross-domain transmission',
      passed: domain.crossDomainLinks.length > 0 && domain.crossDomainLinks.every((link) => link.explanation.trim().length >= 20),
      explanation: domain.crossDomainLinks.length > 0 ? `${domain.crossDomainLinks.length} directional transmission link${domain.crossDomainLinks.length === 1 ? '' : 's'} declared.` : 'At least one bounded cross-domain mechanism is required.',
    },
    {
      id: 'decision_relevance', label: 'Decision relevance',
      passed: domain.admission.expectedDecisionRelevance.trim().length >= 20 && (domain.admission.portfolioSignals.sectors.length + domain.admission.portfolioSignals.subIndustries.length > 0),
      explanation: domain.admission.expectedDecisionRelevance,
    },
    {
      id: 'maintenance_owner', label: 'Maintenance owner',
      passed: input.maintenanceOwner.trim().length >= 3 && domain.admission.maintenanceOwnerRole.trim().length >= 3,
      explanation: input.maintenanceOwner.trim() ? `${input.maintenanceOwner.trim()} owns ${domain.admission.maintenanceOwnerRole}.` : 'A named maintenance owner is required before activation.',
    },
    {
      id: 'economic_capture', label: 'Economic-capture contract',
      passed: domain.economicCapture.rentRecipients.length > 0
        && domain.economicCapture.commoditizedLayers.length > 0
        && domain.economicCapture.durabilityTests.length > 0
        && domain.economicCapture.breakConditions.length > 0,
      explanation: 'The pack must specify who can earn rents, what is commoditized, how durability is tested, and what breaks capture.',
    },
  ]
  return { passed: criteria.every((item) => item.passed), criteria }
}

export interface PortfolioDomainSignal {
  symbol: string
  sector: string
  subIndustry: string
  owned: boolean
  watchlisted: boolean
  acceptedThesis: boolean
}

function matchesDomain(domain: MarketDomainPack, signal: PortfolioDomainSignal): boolean {
  const sectors = new Set(domain.admission.portfolioSignals.sectors.map((item) => item.toLocaleLowerCase()))
  const subIndustries = domain.admission.portfolioSignals.subIndustries.map((item) => item.toLocaleLowerCase())
  return sectors.has(signal.sector.toLocaleLowerCase())
    || subIndustries.some((item) => signal.subIndustry.toLocaleLowerCase().includes(item))
}

/** Portfolio relevance changes research order only. It never admits a domain,
 * accepts evidence, nominates a security, or creates a capital decision. */
export function buildDomainDecisionCoverage(input: {
  domains: readonly MarketDomainPack[]
  portfolioSignals: readonly PortfolioDomainSignal[]
  frontiers: readonly MarketResearchFrontierItem[]
  frontierDomainIds?: ReadonlyMap<string, string>
}): MarketDomainDecisionCoverage[] {
  return input.domains.map((domain) => {
    const matched = input.portfolioSignals.filter((signal) => matchesDomain(domain, signal))
    const ownedSymbols = [...new Set(matched.filter((signal) => signal.owned).map((signal) => signal.symbol))].sort()
    const watchlistedSymbols = [...new Set(matched.filter((signal) => signal.watchlisted && !signal.owned).map((signal) => signal.symbol))].sort()
    const acceptedThesisSymbols = [...new Set(matched.filter((signal) => signal.acceptedThesis).map((signal) => signal.symbol))].sort()
    const highPriorityFrontierCount = input.frontiers.filter((frontier) => (
      frontier.priority >= 4 && input.frontierDomainIds?.get(frontier.id) === domain.id
    )).length
    const priorityScore = Math.min(100,
      Math.min(60, ownedSymbols.length * 20)
      + Math.min(24, watchlistedSymbols.length * 8)
      + Math.min(30, acceptedThesisSymbols.length * 15)
      + Math.min(20, highPriorityFrontierCount * 5),
    )
    const reasons: string[] = []
    if (ownedSymbols.length) reasons.push(`${ownedSymbols.length} owned compan${ownedSymbols.length === 1 ? 'y' : 'ies'} match this domain: ${ownedSymbols.join(', ')}.`)
    if (watchlistedSymbols.length) reasons.push(`${watchlistedSymbols.length} watchlisted compan${watchlistedSymbols.length === 1 ? 'y' : 'ies'} match: ${watchlistedSymbols.join(', ')}.`)
    if (acceptedThesisSymbols.length) reasons.push(`${acceptedThesisSymbols.length} accepted company ${acceptedThesisSymbols.length === 1 ? 'thesis is' : 'theses are'} connected.`)
    if (highPriorityFrontierCount) reasons.push(`${highPriorityFrontierCount} high-priority research frontier${highPriorityFrontierCount === 1 ? '' : 's'} remain open.`)
    if (!reasons.length) reasons.push('No current portfolio, watchlist, accepted-thesis, or high-priority frontier signal raises this domain above baseline maintenance.')
    return { domainId: domain.id, priorityScore, ownedSymbols, watchlistedSymbols, acceptedThesisSymbols, highPriorityFrontierCount, reasons }
  }).sort((left, right) => right.priorityScore - left.priorityScore || left.domainId.localeCompare(right.domainId))
}
