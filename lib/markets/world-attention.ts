import { createHash } from 'node:crypto'

export const WORLD_SOURCE_LANES = [
  'official_primary',
  'global_reporting',
  'specialist',
  'research_data',
  'company_disclosure',
  'market_commentary',
  'pr_syndication',
  'community_discovery',
] as const
export type WorldSourceLane = typeof WORLD_SOURCE_LANES[number]

export const WORLD_ATTENTION_ROUTES = ['urgent', 'investigate', 'monitor', 'awareness', 'company_only', 'noise'] as const
export type WorldAttentionRoute = typeof WORLD_ATTENTION_ROUTES[number]

export const WORLD_SPECIALIST_LENSES = [
  'geopolitics_institutions',
  'physical_economy',
  'macro_finance',
  'technology_industrial_capacity',
] as const
export type WorldSpecialistLens = typeof WORLD_SPECIALIST_LENSES[number]

export interface WorldAttentionDimensions {
  evidenceQuality: number
  novelty: number
  magnitude: number
  systemReach: number
  duration: number
  propagationPotential: number
  transmissionClarity: number
  timeSensitivity: number
  activeDependency: number
  uncertainty: number
}

export interface WorldAttentionDecision {
  route: WorldAttentionRoute
  dimensions: WorldAttentionDimensions
  reasons: string[]
  policyVersion: string
  selectedForEnrichment: boolean
  specialistLenses: WorldSpecialistLens[]
}

export interface WorldAttentionPolicy {
  version: string
  laneBudgets: Record<WorldSourceLane, number>
  totalModelCandidates: number
  thresholds: {
    urgentMagnitude: number
    urgentTimeSensitivity: number
    minimumUrgentEvidence: number
    dependencyTransmission: number
    investigateDimension: number
    monitorDuration: number
  }
}

export const DEFAULT_WORLD_ATTENTION_POLICY: WorldAttentionPolicy = {
  version: 'attention-v1',
  laneBudgets: {
    official_primary: 20,
    global_reporting: 30,
    specialist: 15,
    research_data: 10,
    company_disclosure: 10,
    market_commentary: 5,
    pr_syndication: 5,
    community_discovery: 5,
  },
  totalModelCandidates: 60,
  thresholds: {
    urgentMagnitude: 70,
    urgentTimeSensitivity: 70,
    minimumUrgentEvidence: 50,
    dependencyTransmission: 60,
    investigateDimension: 60,
    monitorDuration: 55,
  },
}

export interface AttentionSource {
  id: string
  title: string
  url: string
  publisher: string
  publishedAt: string | null
  fetchedAt: string
  text?: string
  metadata?: Record<string, unknown>
}

export interface AttentionCandidate {
  fingerprint: string
  title: string
  summary: string
  materiality: number
  novelty: number
  sourceDiversity: number
  claimState: string
  channels: string[]
  geographies: string[]
  thesisDependency: boolean
  portfolioDependency: boolean
  decisiveNewEvent: boolean
  sources: AttentionSource[]
  firstSeenAt: string
}

const OFFICIAL_HOSTS = /(?:\.gov|\.mil|\.int|un\.org|europa\.eu|worldbank\.org|imf\.org|bis\.org|federalreserve\.gov)$/i
const GLOBAL_REPORTERS = /reuters|associated press|ap news|bbc|financial times|bloomberg|wall street journal|new york times|washington post|guardian|al jazeera|nikkei|economist/i
const RESEARCH_PUBLISHERS = /university|institute|research|laboratory|observatory|noaa|nasa|eia|iea|fao|who|world bank|imf|oecd|fred/i
const SPECIALIST_PUBLISHERS = /carbon brief|semafor|foreign policy|war on the rocks|breaking defense|techcrunch|the information|rest of world|inside climate|freightwaves/i
const COMMUNITY_PUBLISHERS = /reddit|hacker news|lobste\.rs|stocktwits|substack|medium/i
const PR_PUBLISHERS = /pr newswire|business wire|globe newswire|accesswire|press release/i
const COMPANY_DISCLOSURE = /investor relations|sec\.gov|earnings|10-k|10-q|8-k|annual report|quarterly report/i
const MARKET_COMMENTARY = /seeking alpha|motley fool|benzinga|marketwatch|analyst|price target|upgrade|downgrade/i

function boundedScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function sourceHost(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase() } catch { return '' }
}

export function canonicalWorldSourceFamily(source: Pick<AttentionSource, 'url' | 'publisher' | 'metadata'>): string {
  const metadataFamily = source.metadata?.sourceFamily
  if (typeof metadataFamily === 'string' && metadataFamily.trim()) return metadataFamily.trim().toLowerCase()
  const host = sourceHost(source.url)
  const publisher = source.publisher.toLowerCase().replace(/\s+(?:via|on)\s+.+$/, '').trim()
  if (/yahoo\.|msn\.|aol\.|marketscreener\./.test(host) && source.metadata?.originalPublisher) {
    return String(source.metadata.originalPublisher).toLowerCase().trim()
  }
  if (PR_PUBLISHERS.test(publisher)) return `syndication:${publisher.replace(/[^a-z0-9]+/g, '-')}`
  return host || publisher || createHash('sha256').update(source.url).digest('hex').slice(0, 16)
}

export function classifyWorldSourceLane(source: Pick<AttentionSource, 'url' | 'publisher' | 'title' | 'metadata'>): WorldSourceLane {
  const explicit = source.metadata?.worldSourceLane
  if (typeof explicit === 'string' && WORLD_SOURCE_LANES.includes(explicit as WorldSourceLane)) return explicit as WorldSourceLane
  const host = sourceHost(source.url)
  const text = `${source.publisher} ${source.title} ${host}`
  if (OFFICIAL_HOSTS.test(host) || COMPANY_DISCLOSURE.test(text) && /sec\.gov/.test(host)) return 'official_primary'
  if (PR_PUBLISHERS.test(text)) return 'pr_syndication'
  if (COMPANY_DISCLOSURE.test(text)) return 'company_disclosure'
  if (GLOBAL_REPORTERS.test(text)) return 'global_reporting'
  if (RESEARCH_PUBLISHERS.test(text)) return 'research_data'
  if (SPECIALIST_PUBLISHERS.test(text)) return 'specialist'
  if (COMMUNITY_PUBLISHERS.test(text)) return 'community_discovery'
  if (MARKET_COMMENTARY.test(text)) return 'market_commentary'
  return 'global_reporting'
}

export function primaryWorldSourceLane(sources: AttentionSource[]): WorldSourceLane {
  const priority: WorldSourceLane[] = ['official_primary', 'research_data', 'global_reporting', 'specialist', 'company_disclosure', 'market_commentary', 'community_discovery', 'pr_syndication']
  const lanes = new Set(sources.map(classifyWorldSourceLane))
  return priority.find((lane) => lanes.has(lane)) ?? 'global_reporting'
}

const SYSTEM_SPILLOVER = /bankrupt|bankruptcy|chapter 11|merger|acquisition|shutdown|plant closure|capacity|shortage|sanction|export control|regulation|systemic|grid|supply chain|recall|default|nationali[sz]|strike|war|tariff/i
const ROUTINE_COMPANY = /earnings|eps|revenue|price target|upgrade|downgrade|beats estimates|misses estimates|stock rises|stock falls|shares (?:rise|fall)|dividend/i
const PROPAGATION = /spillover|contagion|supply chain|shortage|constraint|export control|sanction|shipping|grid|credit|liquidity|food|insurance|migration|refugee/i
const DURABLE = /structural|multi-year|long-term|persistent|drought|reservoir|demographic|authoritarian|industrial policy|capacity|infrastructure|el ni[nñ]o|la ni[nñ]a|enso/i
const TIME_SENSITIVE = /attack|strike|invasion|emergency|default|bank failure|shutdown|outage|ceasefire|election|decision|deadline|warning|alert/i
const UNCERTAIN = /may|could|possible|forecast|rumor|reportedly|unconfirmed|risk|probability|outlook/i
const TRANSMISSION = /price|inflation|yield|rate|capacity|production|supply|demand|cost|margin|trade|export|import|power|energy|crop|food|insurance|credit|liquidity/i

export function deriveWorldAttentionDimensions(candidate: AttentionCandidate): WorldAttentionDimensions {
  const text = `${candidate.title} ${candidate.summary} ${candidate.channels.join(' ')}`
  const lanes = candidate.sources.map(classifyWorldSourceLane)
  const families = new Set(candidate.sources.map(canonicalWorldSourceFamily)).size
  const official = lanes.includes('official_primary')
  const research = lanes.includes('research_data')
  const prOnly = lanes.every((lane) => lane === 'pr_syndication' || lane === 'company_disclosure')
  const activeDependency = candidate.thesisDependency || candidate.portfolioDependency
  return {
    evidenceQuality: boundedScore((official ? 85 : research ? 75 : prOnly ? 30 : 55) + Math.min(15, (families - 1) * 5)),
    novelty: boundedScore(candidate.novelty),
    magnitude: boundedScore(candidate.materiality),
    systemReach: boundedScore(candidate.materiality * 0.45 + candidate.geographies.length * 10 + (PROPAGATION.test(text) ? 25 : 0)),
    duration: boundedScore(25 + (DURABLE.test(text) ? 45 : 0) + (candidate.channels.includes('institutions') ? 15 : 0)),
    propagationPotential: boundedScore(20 + (PROPAGATION.test(text) ? 50 : 0) + Math.min(20, candidate.channels.length * 5)),
    transmissionClarity: boundedScore(20 + (TRANSMISSION.test(text) ? 45 : 0) + (candidate.channels.length > 0 ? 15 : 0)),
    timeSensitivity: boundedScore(20 + (TIME_SENSITIVE.test(text) ? 60 : 0) + (candidate.decisiveNewEvent ? 20 : 0)),
    activeDependency: activeDependency ? 100 : 0,
    uncertainty: boundedScore((candidate.claimState === 'reported' || candidate.claimState === 'contested' ? 60 : 20) + (UNCERTAIN.test(text) ? 20 : 0)),
  }
}

export function routeWorldAttention(candidate: AttentionCandidate, policy = DEFAULT_WORLD_ATTENTION_POLICY): WorldAttentionDecision {
  const dimensions = deriveWorldAttentionDimensions(candidate)
  const lanes = candidate.sources.map(classifyWorldSourceLane)
  const text = `${candidate.title} ${candidate.summary}`
  const companyOnlySources = lanes.every((lane) => ['company_disclosure', 'market_commentary', 'pr_syndication'].includes(lane))
  const systemSpillover = SYSTEM_SPILLOVER.test(text) || candidate.thesisDependency || candidate.portfolioDependency
  const reasons: string[] = []
  let route: WorldAttentionRoute
  if (candidate.claimState === 'officially_confirmed' && candidate.decisiveNewEvent) {
    route = 'urgent'; reasons.push('decisive officially confirmed event')
  } else if (dimensions.magnitude >= policy.thresholds.urgentMagnitude && dimensions.timeSensitivity >= policy.thresholds.urgentTimeSensitivity && dimensions.evidenceQuality >= policy.thresholds.minimumUrgentEvidence) {
    route = 'urgent'; reasons.push('high magnitude, time sensitivity, and evidence quality')
  } else if (dimensions.activeDependency > 0 && dimensions.transmissionClarity >= policy.thresholds.dependencyTransmission) {
    route = 'urgent'; reasons.push('active thesis or portfolio dependency with a clear transmission channel')
  } else if (companyOnlySources && !systemSpillover) {
    route = 'company_only'; reasons.push(ROUTINE_COMPANY.test(text) ? 'routine issuer-specific company news' : 'issuer-specific evidence without system spillover')
  } else if (Math.max(dimensions.magnitude, dimensions.systemReach, dimensions.duration, dimensions.propagationPotential) >= policy.thresholds.investigateDimension && (dimensions.evidenceQuality < 60 || dimensions.transmissionClarity < 60 || dimensions.uncertainty >= 55)) {
    route = 'investigate'; reasons.push('potentially consequential development with incomplete evidence or transmission')
  } else if (Math.max(dimensions.magnitude, dimensions.systemReach, dimensions.propagationPotential) >= policy.thresholds.investigateDimension) {
    route = 'investigate'; reasons.push('causally meaningful system-level development')
  } else if (dimensions.duration >= policy.thresholds.monitorDuration || DURABLE.test(text)) {
    route = 'monitor'; reasons.push('potentially durable signal')
  } else if (dimensions.evidenceQuality >= 40 && dimensions.novelty >= 20) {
    route = 'awareness'; reasons.push('credible observation without a current causal connection')
  } else {
    route = 'noise'; reasons.push('no sufficiently novel factual or causal signal')
  }
  if (lanes.includes('official_primary')) reasons.push('official or primary evidence retained')
  if (dimensions.uncertainty >= 55 && Math.max(dimensions.magnitude, dimensions.systemReach) >= 60 && route === 'noise') {
    route = 'investigate'; reasons.push('weak evidence but large possible consequences')
  }
  return { route, dimensions, reasons, policyVersion: policy.version, selectedForEnrichment: false, specialistLenses: selectWorldSpecialistLenses(candidate, route) }
}

export function selectWorldSpecialistLenses(candidate: AttentionCandidate, route: WorldAttentionRoute, maximum = 2): WorldSpecialistLens[] {
  if (!['urgent', 'investigate'].includes(route)) return []
  const text = `${candidate.title} ${candidate.summary} ${candidate.channels.join(' ')}`
  const scores: Array<[WorldSpecialistLens, number]> = [
    ['geopolitics_institutions', /war|sanction|government|authoritarian|election|military|taiwan|iran|institution|policy/i.test(text) ? 3 : 0],
    ['physical_economy', /climate|weather|el ni[nñ]o|enso|energy|power|food|crop|water|health|demograph|supply chain|shipping|resource/i.test(text) ? 3 : 0],
    ['macro_finance', /inflation|rate|credit|liquidity|bank|sovereign|currency|market|yield|recession|default/i.test(text) ? 3 : 0],
    ['technology_industrial_capacity', /technology|semiconductor|chip|ai|data center|capacity|factory|automation|cyber|export control/i.test(text) ? 3 : 0],
  ]
  return scores.filter(([, score]) => score > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, Math.max(0, Math.min(2, maximum))).map(([lens]) => lens)
}

export function selectWorldModelCandidates<T extends AttentionCandidate>(candidates: T[], policy = DEFAULT_WORLD_ATTENTION_POLICY, now = new Date()): Array<T & { attention: WorldAttentionDecision }> {
  const enriched = candidates.map((candidate) => ({ ...candidate, attention: routeWorldAttention(candidate, policy) }))
  const laneCounts = new Map<WorldSourceLane, number>()
  let selected = 0
  return enriched.sort((a, b) => {
    const routePriority = (route: WorldAttentionRoute) => ({ urgent: 6, investigate: 5, monitor: 4, awareness: 3, company_only: 2, noise: 1 })[route]
    const ageHoursA = Math.max(0, now.getTime() - Date.parse(a.firstSeenAt)) / 3_600_000
    const ageHoursB = Math.max(0, now.getTime() - Date.parse(b.firstSeenAt)) / 3_600_000
    return routePriority(b.attention.route) - routePriority(a.attention.route) || Math.min(24, ageHoursB) - Math.min(24, ageHoursA) || b.materiality - a.materiality
  }).map((candidate) => {
    const lane = primaryWorldSourceLane(candidate.sources)
    const laneBudget = policy.laneBudgets[lane]
    const laneCount = laneCounts.get(lane) ?? 0
    const eligible = !['company_only', 'noise'].includes(candidate.attention.route)
    const aged = now.getTime() - Date.parse(candidate.firstSeenAt) >= 23 * 60 * 60_000
    const selectedForEnrichment = eligible && selected < policy.totalModelCandidates && (laneCount < laneBudget || aged)
    if (selectedForEnrichment) {
      selected += 1
      laneCounts.set(lane, laneCount + 1)
    }
    return { ...candidate, attention: { ...candidate.attention, selectedForEnrichment } }
  })
}

export function tuneWorldAttentionPolicy(base: WorldAttentionPolicy, changes: Partial<WorldAttentionPolicy['thresholds']> & { laneBudgets?: Partial<Record<WorldSourceLane, number>> }): WorldAttentionPolicy {
  const clampChange = (prior: number, requested: number) => boundedScore(Math.max(prior * 0.9, Math.min(prior * 1.1, requested)))
  const thresholds = { ...base.thresholds }
  for (const key of Object.keys(thresholds) as Array<keyof typeof thresholds>) {
    const requested = changes[key]
    if (typeof requested === 'number') thresholds[key] = clampChange(base.thresholds[key], requested)
  }
  const laneBudgets = { ...base.laneBudgets }
  for (const lane of WORLD_SOURCE_LANES) {
    const requested = changes.laneBudgets?.[lane]
    if (typeof requested === 'number') laneBudgets[lane] = Math.max(1, Math.round(Math.max(base.laneBudgets[lane] * 0.9, Math.min(base.laneBudgets[lane] * 1.1, requested))))
  }
  return { ...base, version: `${base.version}-candidate`, laneBudgets, thresholds }
}
