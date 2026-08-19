import type { WorldAttentionRoute, WorldSpecialistLens } from './world-attention.ts'

export interface WorldBenchmarkCase {
  id: string
  family: string
  title: string
  expectedRoute: WorldAttentionRoute
  expectedPrimaryLens?: WorldSpecialistLens
  hardCase: boolean
  ownerLabel: 'seeded_pending_review' | 'confirmed'
}

const templates: Array<Omit<WorldBenchmarkCase, 'id' | 'ownerLabel'>> = [
  { family: 'iran', title: 'Official military escalation threatens Gulf shipping and energy flows', expectedRoute: 'urgent', expectedPrimaryLens: 'geopolitics_institutions', hardCase: true },
  { family: 'china_taiwan', title: 'Taiwan Strait exercise changes shipping and semiconductor risk', expectedRoute: 'investigate', expectedPrimaryLens: 'geopolitics_institutions', hardCase: true },
  { family: 'authoritarianism', title: 'Emergency powers weaken courts and independent institutions', expectedRoute: 'investigate', expectedPrimaryLens: 'geopolitics_institutions', hardCase: true },
  { family: 'enso', title: 'El Niño forecast raises crop hydropower reservoir and insurance risks', expectedRoute: 'monitor', expectedPrimaryLens: 'physical_economy', hardCase: true },
  { family: 'sovereign_banking', title: 'Sovereign funding stress transmits into bank liquidity', expectedRoute: 'investigate', expectedPrimaryLens: 'macro_finance', hardCase: true },
  { family: 'export_controls', title: 'Export controls constrain advanced chip production capacity', expectedRoute: 'investigate', expectedPrimaryLens: 'technology_industrial_capacity', hardCase: true },
  { family: 'ai_power', title: 'Data center electricity load meets interconnection capacity constraint', expectedRoute: 'investigate', expectedPrimaryLens: 'physical_economy', hardCase: true },
  { family: 'routine_earnings', title: 'Company beats quarterly EPS and revenue estimates', expectedRoute: 'company_only', hardCase: false },
  { family: 'pr_syndication', title: 'Syndicated press release repeats a product announcement', expectedRoute: 'company_only', hardCase: false },
  { family: 'contradictory_reporting', title: 'Unconfirmed ceasefire claim is disputed by officials', expectedRoute: 'investigate', expectedPrimaryLens: 'geopolitics_institutions', hardCase: true },
  { family: 'viral_noise', title: 'Viral post repeats a claim without new factual evidence', expectedRoute: 'noise', hardCase: false },
  { family: 'climate_food_credit', title: 'Drought crop losses raise food inflation and farm credit stress', expectedRoute: 'investigate', expectedPrimaryLens: 'physical_economy', hardCase: true },
  { family: 'health_labor', title: 'Disease outbreak disrupts labor availability and logistics capacity', expectedRoute: 'investigate', expectedPrimaryLens: 'physical_economy', hardCase: true },
  { family: 'cyber_physical', title: 'Cyberattack shuts down a systemically important logistics network', expectedRoute: 'urgent', expectedPrimaryLens: 'technology_industrial_capacity', hardCase: true },
  { family: 'demographics_fiscal', title: 'Demographic decline raises structural labor and fiscal pressure', expectedRoute: 'monitor', expectedPrimaryLens: 'physical_economy', hardCase: true },
  { family: 'commodity_substitution', title: 'Critical mineral shortage accelerates substitution and recycling', expectedRoute: 'investigate', expectedPrimaryLens: 'physical_economy', hardCase: true }
]

export const WORLD_BENCHMARK_CASES: WorldBenchmarkCase[] = templates.flatMap((template, templateIndex) =>
  Array.from({ length: 5 }, (_, variationIndex) => ({
    ...template,
    id: `WB-${String(templateIndex * 5 + variationIndex + 1).padStart(3, '0')}`,
    title: variationIndex === 0 ? template.title : `${template.title} - evidence variation ${variationIndex + 1}`,
    ownerLabel: 'seeded_pending_review' as const,
  })),
)
