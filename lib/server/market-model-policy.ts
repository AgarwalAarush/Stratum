import { AI_MODELS } from '../ai/config.ts'

/**
 * The model policy is intentionally central and server-only. Cheap models may
 * route or extract candidates, but durable causal artifacts and their critics
 * remain on the stronger tier. Deterministic ingestion is not represented here
 * because it should not invoke a model at all.
 */
export type MarketModelTask = 'source_scout' | 'observation_triage' | 'research_planning' | 'hypothesis_analysis' | 'hypothesis_critic' | 'prediction_evaluation'
export type MarketModelTier = 'cheap' | 'standard' | 'strong'

export interface MarketModelSelection {
  task: MarketModelTask
  tier: MarketModelTier
  model: string
  rationale: string
}

/**
 * A strong research pass is an analyst-plus-critic pair. Keep unattended
 * scheduler spend bounded independently of source and evaluation work; an
 * explicit user-requested deepening is not subject to this planner cap.
 */
export function scheduledMarketResearchRunLimit(environment: NodeJS.ProcessEnv = process.env): number {
  const configured = Number(environment.STRATUM_MARKET_RESEARCH_RUN_LIMIT ?? 2)
  return Number.isInteger(configured) && configured >= 1 && configured <= 12 ? configured : 2
}

/** Concurrent cheap/standard worker slots. Strong research stays effectively serial
 * because orchestration caps expensive jobs and the pool is small. */
export function workerJobConcurrency(environment: NodeJS.ProcessEnv = process.env): number {
  const configured = Number(environment.STRATUM_WORKER_CONCURRENCY ?? 2)
  return Number.isInteger(configured) && configured >= 1 && configured <= 4 ? configured : 2
}

export function selectMarketModel(task: MarketModelTask, environment: NodeJS.ProcessEnv = process.env): MarketModelSelection {
  const cheap = environment.STRATUM_SOURCE_SCOUT_MODEL ?? AI_MODELS.sourceScout
  const standard = environment.STRATUM_MARKET_STANDARD_MODEL ?? environment.CODEX_SYNTHESIS_MODEL ?? AI_MODELS.scheduledSynthesis
  const strong = environment.STRATUM_MARKET_RESEARCH_MODEL ?? environment.CODEX_SYNTHESIS_MODEL ?? AI_MODELS.scheduledSynthesis
  if (task === 'source_scout' || task === 'observation_triage') {
    return { task, tier: 'cheap', model: cheap, rationale: 'Non-authoritative source or observation routing; outputs require deterministic validation and source approval.' }
  }
  if (task === 'research_planning' || task === 'prediction_evaluation') {
    return { task, tier: 'standard', model: standard, rationale: 'Bounded planning or evaluation over persisted evidence; it cannot publish a thesis.' }
  }
  return { task, tier: 'strong', model: strong, rationale: 'Causal research and adversarial critique can affect a durable market artifact but still require source and promotion gates.' }
}
