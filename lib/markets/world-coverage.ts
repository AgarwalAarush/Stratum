import type { WorldNode } from './world-thinker-types.ts'

export type WorldCoverageStatus = 'healthy' | 'thin' | 'stale' | 'blind_spot'

export interface WorldCoverageFrontierDefinition {
  id: string
  label: string
  description: string
  queryTerms: string[]
  priority: number
  entityTerms: string[]
  phrases: string[]
  termGroups: string[][]
  channels?: string[]
}

export interface WorldCoverageFrontier extends WorldCoverageFrontierDefinition {
  status: WorldCoverageStatus
  sourceFamilyCount: number
  evidenceEventCount: number
  weakSignalCount: number
  activeNodeIds: string[]
  openQuestions: string[]
  lastEvidenceAt: string | null
  lastReviewedAt: string | null
  lastSearchAt: string | null
  nextReviewAt: string
}

export const WORLD_COVERAGE_FRONTIERS: WorldCoverageFrontierDefinition[] = [
  { id: 'china-taiwan', label: 'China and Taiwan', description: 'Cross-strait security, US-China competition, industrial policy, trade, and semiconductor dependencies.', queryTerms: ['Taiwan Strait', 'China Taiwan military', 'US China export controls'], priority: 100, entityTerms: ['taiwan', 'taiwanese', 'taipei'], phrases: ['taiwan strait', 'cross strait'], termGroups: [['china', 'taiwan'], ['china', 'export control'], ['china', 'semiconductor']] },
  { id: 'iran-middle-east', label: 'Iran and the Middle East', description: 'Iran, Israel, Gulf security, regional conflict, shipping, energy, and sanctions transmission.', queryTerms: ['Iran Israel Gulf security', 'Red Sea shipping', 'Iran sanctions energy'], priority: 100, entityTerms: ['iran', 'iranian', 'tehran'], phrases: ['strait of hormuz', 'red sea shipping'], termGroups: [['gulf', 'security'], ['israel', 'iran']] },
  { id: 'russia-europe-security', label: 'Russia and European security', description: 'Russia-Ukraine conflict, NATO posture, European defense, energy, and sanctions.', queryTerms: ['Russia Ukraine war', 'NATO Europe security', 'Russia sanctions energy'], priority: 90, entityTerms: ['russia', 'russian', 'ukraine', 'ukrainian', 'nato'], phrases: ['european defense'], termGroups: [['europe', 'security']] },
  { id: 'political-institutions', label: 'Political institutions', description: 'Authoritarian consolidation, democratic erosion, elections, coups, emergency powers, and civil unrest.', queryTerms: ['authoritarianism democratic backsliding', 'emergency powers election', 'coup civil unrest'], priority: 100, entityTerms: ['authoritarian', 'authoritarianism', 'autocracy', 'autocratic', 'coup'], phrases: ['democratic backsliding', 'emergency powers', 'martial law', 'civil unrest'], termGroups: [['election', 'institution'], ['democracy', 'erosion']] },
  { id: 'macro-sovereign', label: 'Macro and sovereign conditions', description: 'Monetary policy, fiscal capacity, sovereign credit, inflation, growth, and currency stress.', queryTerms: ['global monetary policy', 'sovereign debt crisis', 'currency inflation growth'], priority: 85, entityTerms: ['inflation', 'deflation', 'recession'], phrases: ['monetary policy', 'fiscal capacity', 'sovereign debt', 'currency crisis', 'central bank'], termGroups: [['sovereign', 'credit']], channels: ['macro'] },
  { id: 'trade-industrial-policy', label: 'Trade and industrial policy', description: 'Tariffs, sanctions, export controls, subsidies, strategic trade, and supply-chain relocation.', queryTerms: ['tariffs sanctions export controls', 'industrial policy subsidies', 'supply chain reshoring'], priority: 90, entityTerms: ['tariff', 'tariffs', 'sanction', 'sanctions', 'embargo'], phrases: ['export control', 'industrial policy', 'supply chain relocation', 'supply chain reshoring'], termGroups: [['trade', 'restriction']] },
  { id: 'energy-resources-climate', label: 'Energy, resources, and climate', description: 'Energy systems, commodities, critical materials, climate shocks, food, and water constraints.', queryTerms: ['energy commodities shortage', 'critical minerals', 'climate food water risk'], priority: 85, entityTerms: ['enso', 'drought', 'hydropower'], phrases: ['el nino', 'la nina', 'critical minerals', 'climate shock', 'food inflation', 'water stress', 'power grid'], termGroups: [['energy', 'shortage'], ['crop', 'failure']] },
  { id: 'technology-industrial-capacity', label: 'Technology and industrial capacity', description: 'AI, semiconductors, cyber, power, infrastructure, manufacturing, and bottlenecks.', queryTerms: ['AI semiconductor cyber', 'data center power', 'industrial capacity bottleneck'], priority: 90, entityTerms: ['semiconductor', 'semiconductors', 'cybersecurity'], phrases: ['artificial intelligence', 'data center', 'industrial capacity', 'manufacturing bottleneck'], termGroups: [['ai', 'power']] },
  { id: 'health-demographics-labor', label: 'Health, demographics, and labor', description: 'Public health, demographic change, migration, labor supply, and productivity.', queryTerms: ['public health outbreak', 'demographic labor shortage', 'migration workforce'], priority: 70, entityTerms: ['ebola', 'pandemic', 'epidemic', 'demographics'], phrases: ['public health', 'disease outbreak', 'labor shortage', 'labor supply', 'workforce migration'], termGroups: [['migration', 'labor']] },
  { id: 'credit-liquidity-markets', label: 'Credit, liquidity, and markets', description: 'Credit conditions, banking stress, liquidity, positioning, volatility, and market structure.', queryTerms: ['credit conditions liquidity', 'banking stress', 'market positioning volatility'], priority: 80, entityTerms: ['liquidity', 'contagion'], phrases: ['credit conditions', 'banking stress', 'bank failure', 'market structure', 'funding stress'], termGroups: [['credit', 'spread'], ['market', 'volatility']] },
]

export interface WorldCoverageEvidence {
  title?: string
  summary?: string
  actors?: string[]
  geographies?: string[]
  channels?: string[]
}

function normalizedCoverageText(value: string): string {
  return ` ${value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()} `
}

function containsCoverageTerm(text: string, term: string): boolean {
  return text.includes(normalizedCoverageText(term))
}

export function matchesWorldCoverageFrontier(frontier: WorldCoverageFrontierDefinition, evidence: string | WorldCoverageEvidence): boolean {
  const structured = typeof evidence === 'string' ? { title: evidence } : evidence
  const entityText = normalizedCoverageText([...(structured.actors ?? []), ...(structured.geographies ?? [])].join(' '))
  const narrativeText = normalizedCoverageText([structured.title ?? '', structured.summary ?? ''].join(' '))
  const allText = `${entityText}${narrativeText}`
  if (frontier.entityTerms.some((term) => containsCoverageTerm(allText, term))) return true
  if (frontier.phrases.some((phrase) => containsCoverageTerm(allText, phrase))) return true
  if (frontier.termGroups.some((group) => group.every((term) => containsCoverageTerm(allText, term)))) return true
  return Boolean(frontier.channels?.some((channel) => (structured.channels ?? []).includes(channel)))
}

export function deriveWorldCoverageIndex(nodes: WorldNode[]): Array<Pick<WorldCoverageFrontierDefinition, 'id' | 'label' | 'description' | 'priority'> & { activeNodeIds: string[]; nodeCount: number }> {
  const active = nodes.filter((node) => ['active', 'monitoring'].includes(node.status) && node.kind !== 'journal' && node.kind !== 'current')
  return WORLD_COVERAGE_FRONTIERS.map((frontier) => {
    const activeNodeIds = active.filter((node) => matchesWorldCoverageFrontier(frontier, { title: `${node.id} ${node.title} ${node.aliases.join(' ')}`, summary: node.summary })).map((node) => node.id)
    return { id: frontier.id, label: frontier.label, description: frontier.description, priority: frontier.priority, activeNodeIds, nodeCount: activeNodeIds.length }
  })
}

export function assessWorldCoverage(input: { lastEvidenceAt: string | null; sourceFamilyCount: number; activeNodeCount: number }, now = new Date()): WorldCoverageStatus {
  if (!input.lastEvidenceAt) return 'blind_spot'
  const ageHours = (now.getTime() - Date.parse(input.lastEvidenceAt)) / 3_600_000
  if (!Number.isFinite(ageHours) || ageHours > 72) return 'stale'
  if (ageHours > 24 || input.sourceFamilyCount < 2 || input.activeNodeCount === 0) return 'thin'
  return 'healthy'
}
