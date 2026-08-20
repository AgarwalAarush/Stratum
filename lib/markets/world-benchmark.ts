import type { WorldAttentionRoute, WorldSpecialistLens, WorldSourceLane } from './world-attention.ts'

export const WORLD_BENCHMARK_TARGET = { minimum: 75, maximum: 100 } as const

export interface WorldBenchmarkFamilyDefinition {
  id: string
  label: string
  pattern: RegExp
  hardCase: boolean
}

export const WORLD_BENCHMARK_FAMILIES: WorldBenchmarkFamilyDefinition[] = [
  { id: 'iran', label: 'Iran and regional conflict', pattern: /\b(?:iran|iranian|tehran|hormuz)\b/i, hardCase: true },
  { id: 'china_taiwan', label: 'China and Taiwan', pattern: /\b(?:taiwan|taiwanese|taipei|cross[- ]strait)\b/i, hardCase: true },
  { id: 'authoritarianism', label: 'Authoritarianism and institutions', pattern: /\b(?:authoritarian|autocra|democratic backsliding|coup|emergency powers|martial law)\b/i, hardCase: true },
  { id: 'enso', label: 'ENSO and climate transmission', pattern: /\b(?:enso|el ni[nñ]o|la ni[nñ]a|drought|hydropower|crop failure)\b/i, hardCase: true },
  { id: 'sovereign_banking', label: 'Sovereign and banking stress', pattern: /\b(?:sovereign|bank failure|banking stress|funding stress|liquidity crisis)\b/i, hardCase: true },
  { id: 'export_controls', label: 'Export controls and industrial policy', pattern: /\b(?:export controls?|tariffs?|sanctions?|embargo|industrial policy)\b/i, hardCase: true },
  { id: 'ai_power', label: 'AI and power capacity', pattern: /\b(?:data cent(?:er|re)|artificial intelligence|ai)\b.*\b(?:power|electricity|grid|capacity)\b|\b(?:power|electricity|grid)\b.*\b(?:data cent(?:er|re)|ai)\b/i, hardCase: true },
  { id: 'contradictory_reporting', label: 'Contradictory reporting', pattern: /\b(?:disputed|contested|retracted|denied|unconfirmed|contradict)\b/i, hardCase: true },
  { id: 'climate_food_credit', label: 'Climate, food, and credit', pattern: /\b(?:food inflation|crop loss|agricultural credit|farm credit|reservoir stress)\b/i, hardCase: true },
  { id: 'health_labor', label: 'Health and labor capacity', pattern: /\b(?:outbreak|epidemic|pandemic|ebola)\b/i, hardCase: true },
  { id: 'biotech_clinical', label: 'Biotech clinical and regulatory catalysts', pattern: /\b(?:phase\s*[123]|pivotal trial|primary endpoint|clinical hold|complete response letter|pdufa|fda approval|overall survival|progression-free survival)\b/i, hardCase: true },
  { id: 'cyber_physical', label: 'Cyber and physical systems', pattern: /\b(?:cyberattack|ransomware|cyber attack)\b/i, hardCase: true },
  { id: 'demographics_fiscal', label: 'Demographics and fiscal capacity', pattern: /\b(?:demographic|aging population|fertility decline)\b/i, hardCase: true },
  { id: 'commodity_substitution', label: 'Commodity constraint and substitution', pattern: /\b(?:critical mineral|commodity shortage|substitution|recycling capacity)\b/i, hardCase: true },
  { id: 'routine_earnings', label: 'Routine earnings', pattern: /\b(?:quarterly earnings|eps|revenue estimates|price target|upgrade|downgrade)\b/i, hardCase: false },
  { id: 'pr_syndication', label: 'PR syndication', pattern: /\b(?:press release|product announcement|pr newswire|business wire|globe newswire)\b/i, hardCase: false },
  { id: 'viral_noise', label: 'Viral noise', pattern: /\b(?:viral|rumor|social media post|without evidence)\b/i, hardCase: false },
]

export interface BenchmarkClassificationInput {
  title: string
  summary?: string
  sourceLane?: WorldSourceLane | null
  route?: WorldAttentionRoute | null
}

export function classifyWorldBenchmarkFamily(input: BenchmarkClassificationInput): { family: string; hardCase: boolean } {
  const text = `${input.title} ${input.summary ?? ''}`
  const matched = WORLD_BENCHMARK_FAMILIES.find((family) => family.pattern.test(text))
  if (matched) return { family: matched.id, hardCase: matched.hardCase }
  if (input.sourceLane === 'pr_syndication') return { family: 'pr_syndication', hardCase: false }
  if (input.route === 'company_only') return { family: 'routine_company', hardCase: false }
  if (input.route === 'noise') return { family: 'general_noise', hardCase: false }
  return { family: 'novel_cross_domain', hardCase: true }
}

export interface PersistedWorldBenchmarkCase {
  id: string
  eventClusterId: string
  family: string
  title: string
  materiality: number
  officialPrimary: boolean
  sourceIds: string[]
  sourceUrls: string[]
  observedRoute: WorldAttentionRoute
  observedSpecialistLenses: WorldSpecialistLens[]
  expectedRoute: WorldAttentionRoute | null
  expectedPrimaryLens: WorldSpecialistLens | null
  hardCase: boolean
  status: 'pending_owner_review' | 'confirmed' | 'rejected'
}
