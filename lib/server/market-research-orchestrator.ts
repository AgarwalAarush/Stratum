import type { MarketOrchestrationActionType } from '../markets/types.ts'
import { getSupabaseClient } from './supabase.ts'
import { enqueueAgentJob, type AgentJobType } from './agent-jobs.ts'

type RecordValue = Record<string, unknown>

export interface OrchestrationDomainInput {
  domainId: string
  pendingReviews: number
  queuedFrontierIds: string[]
  evidenceReceived: number
  recentRecurringLeads: number
  freshGovernedEvidence: number
  approvedSourceCount: number
  recentActionTypes: MarketOrchestrationActionType[]
}

export interface PlannedOrchestrationAction {
  domainId: string
  actionType: MarketOrchestrationActionType
  priority: number
  rationale: string
  deterministicSignals: Record<string, unknown>
  payload: Record<string, unknown>
  jobType: AgentJobType | null
}

const COOLDOWN_ACTIONS = new Set<MarketOrchestrationActionType>([
  'investigate_broad', 'verify_recurring_source', 'critic_revision', 'collect_known_source',
])

function eligible(input: OrchestrationDomainInput, type: MarketOrchestrationActionType): boolean {
  return !COOLDOWN_ACTIONS.has(type) || !input.recentActionTypes.includes(type)
}

/**
 * The first orchestration pass is intentionally deterministic. It makes the
 * work queue explainable and bounded before a model is allowed to arbitrate
 * genuinely ambiguous priorities. Lower numeric priority claims the worker
 * first, matching agent_jobs.
 */
export function planMarketResearchActions(inputs: OrchestrationDomainInput[]): PlannedOrchestrationAction[] {
  return inputs.flatMap((input) => {
    const signals = {
      pendingReviews: input.pendingReviews,
      queuedFrontiers: input.queuedFrontierIds.length,
      evidenceReceived: input.evidenceReceived,
      recentRecurringLeads: input.recentRecurringLeads,
      freshGovernedEvidence: input.freshGovernedEvidence,
      approvedSourceCount: input.approvedSourceCount,
    }
    const actions: PlannedOrchestrationAction[] = []
    if (input.pendingReviews > 0) {
      actions.push({ domainId: input.domainId, actionType: 'awaiting_review', priority: 10,
        rationale: `${input.pendingReviews} quote-bound proposal${input.pendingReviews === 1 ? ' is' : 's are'} awaiting governed review; no model job is allowed to turn them into evidence.`,
        deterministicSignals: signals, payload: {}, jobType: null })
    }
    if (input.queuedFrontierIds.length > 0 && eligible(input, 'investigate_broad')) {
      actions.push({ domainId: input.domainId, actionType: 'investigate_broad', priority: 35,
        rationale: `${input.queuedFrontierIds.length} unresolved causal frontier${input.queuedFrontierIds.length === 1 ? '' : 's'} need broad, cited investigation including disconfirming material.`,
        deterministicSignals: signals, payload: { frontierIds: input.queuedFrontierIds.slice(0, 8), trigger: 'frontier_gap' }, jobType: 'scout-market-research' })
    }
    if (input.recentRecurringLeads > 0 && eligible(input, 'verify_recurring_source')) {
      actions.push({ domainId: input.domainId, actionType: 'verify_recurring_source', priority: 45,
        rationale: `${input.recentRecurringLeads} provisional broad-research lead${input.recentRecurringLeads === 1 ? ' suggests' : 's suggest'} recurring value; verify bounded source candidates without admitting a source.`,
        deterministicSignals: signals, payload: { trigger: 'orchestration' }, jobType: 'scout-world-sources' })
    }
    if ((input.evidenceReceived > 0 || input.freshGovernedEvidence >= 3) && eligible(input, 'critic_revision')) {
      actions.push({ domainId: input.domainId, actionType: 'critic_revision', priority: 55,
        rationale: input.evidenceReceived > 0
          ? `${input.evidenceReceived} frontier item${input.evidenceReceived === 1 ? ' has' : 's have'} accepted governed evidence and needs bounded analyst-plus-critic reassessment.`
          : `${input.freshGovernedEvidence} fresh governed observations warrant a bounded research/critic refresh, not a thesis promotion.`,
        deterministicSignals: signals, payload: { trigger: 'orchestration' }, jobType: 'refresh-market-hypothesis-research' })
    }
    if (input.approvedSourceCount > 0 && input.freshGovernedEvidence === 0 && eligible(input, 'collect_known_source')) {
      actions.push({ domainId: input.domainId, actionType: 'collect_known_source', priority: 65,
        rationale: `${input.approvedSourceCount} approved source${input.approvedSourceCount === 1 ? '' : 's'} have no fresh governed evidence in the planning window; request bounded collection under existing contracts.`,
        deterministicSignals: signals, payload: { trigger: 'orchestration' }, jobType: 'collect-world-source-documents' })
    }
    if (actions.length === 0) actions.push({ domainId: input.domainId, actionType: 'no_action', priority: 999,
      rationale: 'No bounded action is currently eligible; preserve budget and wait for new governed evidence, frontier work, or review.',
      deterministicSignals: signals, payload: {}, jobType: null })
    return actions.slice(0, 3)
  }).sort((a, b) => a.priority - b.priority || a.domainId.localeCompare(b.domainId))
}

function record(value: unknown): RecordValue { return value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {} }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean) : [] }

async function loadInputs(now: Date): Promise<{ inputs: OrchestrationDomainInput[]; marketRegime: string | null }> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const freshAfter = new Date(now.getTime() - 36 * 60 * 60 * 1_000).toISOString()
  const cooldownAfter = new Date(now.getTime() - 6 * 60 * 60 * 1_000).toISOString()
  const [domains, proposals, frontiers, leads, observations, sources, actions, state] = await Promise.all([
    supabase.from('market_domain_packs').select('id').eq('status', 'active'),
    supabase.from('world_observation_proposals').select('domain_id,world_observation_proposal_reviews(decision)'),
    supabase.from('market_hypothesis_research_frontier').select('id,status,market_hypotheses!inner(scope)').in('status', ['queued', 'evidence_received']),
    supabase.from('market_research_scout_runs').select('domain_id,leads,created_at').eq('status', 'complete').gte('created_at', freshAfter),
    supabase.from('world_observations').select('domain,ingested_at').gte('ingested_at', freshAfter),
    supabase.from('world_source_domains').select('domain_id,world_source_registry!inner(status)').in('world_source_registry.status', ['approved', 'probation']),
    supabase.from('market_orchestration_actions').select('domain_id,action_type,created_at').gte('created_at', cooldownAfter),
    supabase.from('market_states').select('regime').order('generated_at', { ascending: false }).limit(1).maybeSingle(),
  ])
  const error = domains.error ?? proposals.error ?? frontiers.error ?? leads.error ?? observations.error ?? sources.error ?? actions.error ?? state.error
  if (error) throw new Error(`Unable to load market orchestration inputs: ${error.message}`)
  const active = (domains.data ?? []).map((row) => String(row.id))
  const inputByDomain = new Map(active.map((domainId) => [domainId, { domainId, pendingReviews: 0, queuedFrontierIds: [] as string[], evidenceReceived: 0, recentRecurringLeads: 0, freshGovernedEvidence: 0, approvedSourceCount: 0, recentActionTypes: [] as MarketOrchestrationActionType[] }]))
  for (const row of proposals.data ?? []) {
    const target = inputByDomain.get(String(row.domain_id)); const review = record(row.world_observation_proposal_reviews)
    if (target && !review.decision) target.pendingReviews += 1
  }
  for (const row of frontiers.data ?? []) {
    const hypothesis = record(row.market_hypotheses); const target = inputByDomain.get(String(hypothesis.scope)); if (!target) continue
    if (row.status === 'queued') target.queuedFrontierIds.push(String(row.id)); else target.evidenceReceived += 1
  }
  for (const row of leads.data ?? []) {
    const target = inputByDomain.get(String(row.domain_id)); if (!target) continue
    target.recentRecurringLeads += (Array.isArray(row.leads) ? row.leads : []).filter((lead) => Boolean(record(lead).recurringSourceCandidate)).length
  }
  for (const row of observations.data ?? []) { const target = inputByDomain.get(String(row.domain)); if (target) target.freshGovernedEvidence += 1 }
  for (const row of sources.data ?? []) { const target = inputByDomain.get(String(row.domain_id)); if (target) target.approvedSourceCount += 1 }
  for (const row of actions.data ?? []) { const target = inputByDomain.get(String(row.domain_id)); const type = String(row.action_type) as MarketOrchestrationActionType; if (target && COOLDOWN_ACTIONS.has(type)) target.recentActionTypes.push(type) }
  return { inputs: [...inputByDomain.values()], marketRegime: state.data?.regime ? String(state.data.regime) : null }
}

export async function runMarketResearchOrchestration(input: { trigger: 'scheduled' | 'manual'; now?: Date } = { trigger: 'scheduled' }): Promise<{ runId: string; planned: number; enqueued: number; awaitingReview: number }> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const now = input.now ?? new Date()
  const context = await loadInputs(now)
  const { data: run, error: createError } = await supabase.from('market_orchestration_runs').insert({ status: 'running', trigger: input.trigger, market_regime: context.marketRegime, input_summary: { domainCount: context.inputs.length, planner: 'deterministic-v1' } }).select('id').single()
  if (createError || !run) throw new Error(`Unable to create market orchestration run: ${createError?.message ?? 'unknown error'}`)
  try {
    const actions = planMarketResearchActions(context.inputs)
    let enqueued = 0; let awaitingReview = 0
    for (const action of actions) {
      let jobId: string | null = null; let state: 'enqueued' | 'awaiting_review' | 'no_action' | 'skipped' = action.actionType === 'awaiting_review' ? 'awaiting_review' : action.actionType === 'no_action' ? 'no_action' : 'skipped'
      if (action.jobType) {
        const reason = action.actionType === 'investigate_broad'
          ? action.rationale
          : `${action.actionType}: ${action.rationale}`
        const queued = await enqueueAgentJob(action.jobType, { domainId: action.domainId, reason, ...action.payload })
        jobId = queued.id; state = 'enqueued'; if (!queued.deduplicated) enqueued += 1
      }
      if (state === 'awaiting_review') awaitingReview += 1
      const { error } = await supabase.from('market_orchestration_actions').insert({ run_id: run.id, domain_id: action.domainId, action_type: action.actionType, state, priority: action.priority, rationale: action.rationale, deterministic_signals: action.deterministicSignals, job_type: action.jobType, job_id: jobId })
      if (error) throw new Error(`Unable to save orchestration action: ${error.message}`)
    }
    const { error: finishError } = await supabase.from('market_orchestration_runs').update({ status: 'complete', completed_at: new Date().toISOString() }).eq('id', run.id)
    if (finishError) throw new Error(`Unable to complete market orchestration run: ${finishError.message}`)
    return { runId: String(run.id), planned: actions.length, enqueued, awaitingReview }
  } catch (cause) {
    await supabase.from('market_orchestration_runs').update({ status: 'failed', completed_at: new Date().toISOString(), error: cause instanceof Error ? cause.message : String(cause) }).eq('id', run.id)
    throw cause
  }
}
