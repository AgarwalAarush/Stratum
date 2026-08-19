import type { WorldNode } from './world-thinker-types.ts'

export type WorldCoverageStatus = 'healthy' | 'thin' | 'stale' | 'blind_spot'

export interface WorldCoverageFrontierDefinition {
  id: string
  label: string
  description: string
  queryTerms: string[]
  priority: number
}

export interface WorldCoverageFrontier extends WorldCoverageFrontierDefinition {
  status: WorldCoverageStatus
  sourceFamilyCount: number
  activeNodeIds: string[]
  openQuestions: string[]
  lastEvidenceAt: string | null
  lastReviewedAt: string | null
  lastSearchAt: string | null
  nextReviewAt: string
}

export const WORLD_COVERAGE_FRONTIERS: WorldCoverageFrontierDefinition[] = [
  { id: 'china-taiwan', label: 'China and Taiwan', description: 'Cross-strait security, US-China competition, industrial policy, trade, and semiconductor dependencies.', queryTerms: ['Taiwan Strait', 'China Taiwan military', 'US China export controls'], priority: 100 },
  { id: 'iran-middle-east', label: 'Iran and the Middle East', description: 'Iran, Israel, Gulf security, regional conflict, shipping, energy, and sanctions transmission.', queryTerms: ['Iran Israel Gulf security', 'Red Sea shipping', 'Iran sanctions energy'], priority: 100 },
  { id: 'russia-europe-security', label: 'Russia and European security', description: 'Russia-Ukraine conflict, NATO posture, European defense, energy, and sanctions.', queryTerms: ['Russia Ukraine war', 'NATO Europe security', 'Russia sanctions energy'], priority: 90 },
  { id: 'political-institutions', label: 'Political institutions', description: 'Authoritarian consolidation, democratic erosion, elections, coups, emergency powers, and civil unrest.', queryTerms: ['authoritarianism democratic backsliding', 'emergency powers election', 'coup civil unrest'], priority: 100 },
  { id: 'macro-sovereign', label: 'Macro and sovereign conditions', description: 'Monetary policy, fiscal capacity, sovereign credit, inflation, growth, and currency stress.', queryTerms: ['global monetary policy', 'sovereign debt crisis', 'currency inflation growth'], priority: 85 },
  { id: 'trade-industrial-policy', label: 'Trade and industrial policy', description: 'Tariffs, sanctions, export controls, subsidies, strategic trade, and supply-chain relocation.', queryTerms: ['tariffs sanctions export controls', 'industrial policy subsidies', 'supply chain reshoring'], priority: 90 },
  { id: 'energy-resources-climate', label: 'Energy, resources, and climate', description: 'Energy systems, commodities, critical materials, climate shocks, food, and water constraints.', queryTerms: ['energy commodities shortage', 'critical minerals', 'climate food water risk'], priority: 85 },
  { id: 'technology-industrial-capacity', label: 'Technology and industrial capacity', description: 'AI, semiconductors, cyber, power, infrastructure, manufacturing, and bottlenecks.', queryTerms: ['AI semiconductor cyber', 'data center power', 'industrial capacity bottleneck'], priority: 90 },
  { id: 'health-demographics-labor', label: 'Health, demographics, and labor', description: 'Public health, demographic change, migration, labor supply, and productivity.', queryTerms: ['public health outbreak', 'demographic labor shortage', 'migration workforce'], priority: 70 },
  { id: 'credit-liquidity-markets', label: 'Credit, liquidity, and markets', description: 'Credit conditions, banking stress, liquidity, positioning, volatility, and market structure.', queryTerms: ['credit conditions liquidity', 'banking stress', 'market positioning volatility'], priority: 80 },
]

const COVERAGE_STOPWORDS = new Set(['and', 'the', 'global', 'conditions', 'security', 'policy', 'risk'])

export function worldCoverageTokens(frontier: WorldCoverageFrontierDefinition): string[] {
  return [...new Set(frontier.queryTerms.join(' ').toLowerCase().split(/[^a-z0-9]+/).filter((term) => term.length >= 3 && !COVERAGE_STOPWORDS.has(term)))]
}

export function matchesWorldCoverageFrontier(frontier: WorldCoverageFrontierDefinition, value: string): boolean {
  const normalized = value.toLowerCase()
  return worldCoverageTokens(frontier).some((token) => normalized.includes(token))
}

export function deriveWorldCoverageIndex(nodes: WorldNode[]): Array<Pick<WorldCoverageFrontierDefinition, 'id' | 'label' | 'description' | 'priority'> & { activeNodeIds: string[]; nodeCount: number }> {
  const active = nodes.filter((node) => ['active', 'monitoring'].includes(node.status) && node.kind !== 'journal' && node.kind !== 'current')
  return WORLD_COVERAGE_FRONTIERS.map((frontier) => {
    const activeNodeIds = active.filter((node) => matchesWorldCoverageFrontier(frontier, [node.id, node.title, node.summary, ...node.aliases].join(' '))).map((node) => node.id)
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

