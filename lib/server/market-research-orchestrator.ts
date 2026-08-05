import type { MarketOrchestrationActionType } from '../markets/types.ts'
import { getSupabaseClient } from './supabase.ts'
import { enqueueAgentJob, type AgentJobType } from './agent-jobs.ts'
import { scheduledMarketResearchRunLimit, selectMarketModel } from './market-model-policy.ts'
import { autoAcceptEligibleWorldObservationProposals } from './world-observation-review.ts'
import { runCodexJson, type CodexExecResult } from './codex-exec.ts'

type RecordValue = Record<string, unknown>

export interface OrchestrationDomainInput {
  domainId: string
  pendingReviews: number
  queuedFrontierIds: string[]
  evidenceReceived: number
  reliableRecurringPublishers: number
  contradictingLeads: number
  strongestDisconfirmingClaim: string | null
  freshGovernedEvidence: number
  approvedSourceCount: number
  duePredictionIds: string[]
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
  costTier: 'none' | 'cheap' | 'standard' | 'strong'
}

const COOLDOWN_ACTIONS = new Set<MarketOrchestrationActionType>([
  'investigate_broad', 'investigate_counter_evidence', 'verify_recurring_source', 'critic_revision', 'collect_known_source',
])

const EXPENSIVE_ACTIONS = new Set<MarketOrchestrationActionType>([
  'investigate_broad', 'investigate_counter_evidence', 'critic_revision',
])

function eligible(input: OrchestrationDomainInput, type: MarketOrchestrationActionType): boolean {
  return !COOLDOWN_ACTIONS.has(type) || !input.recentActionTypes.includes(type)
}

function actionKey(action: PlannedOrchestrationAction): string {
  return `${action.domainId}:${action.actionType}`
}

function regimePriorityNudge(domainId: string, actionType: MarketOrchestrationActionType, marketRegime: string | null): number {
  if (!marketRegime) return 0
  const riskOff = /risk[-\s]?off|policy|geopolit/i.test(marketRegime)
  if (!riskOff) return 0
  if (domainId === 'macro-policy-geopolitics') return -8
  if (actionType === 'investigate_counter_evidence') return -6
  return 0
}

/**
 * Deterministic eligibility and priority. Expensive actions may later be
 * deferred by budget; a standard-tier model only ranks when they contend.
 *
 * Unattended 6h spend shape (hard caps, not dollar estimates):
 * - planner: 0–1 standard call when expensive work exceeds budget
 * - auto-accept / collect: no model
 * - prediction eval: up to 10 standard
 * - broad/counter scout + critic: <= STRATUM_MARKET_RESEARCH_RUN_LIMIT (default 2)
 * - recurring source scout: <= 2 cheap
 */
export function planMarketResearchActions(
  inputs: OrchestrationDomainInput[],
  options: { marketRegime?: string | null } = {},
): PlannedOrchestrationAction[] {
  const marketRegime = options.marketRegime ?? null
  return inputs.flatMap((input) => {
    const signals = {
      pendingReviews: input.pendingReviews,
      queuedFrontiers: input.queuedFrontierIds.length,
      evidenceReceived: input.evidenceReceived,
      reliableRecurringPublishers: input.reliableRecurringPublishers,
      contradictingLeads: input.contradictingLeads,
      freshGovernedEvidence: input.freshGovernedEvidence,
      approvedSourceCount: input.approvedSourceCount,
      duePredictions: input.duePredictionIds.length,
      marketRegime,
    }
    const actions: PlannedOrchestrationAction[] = []
    const nudge = (type: MarketOrchestrationActionType, base: number) => base + regimePriorityNudge(input.domainId, type, marketRegime)

    if (input.pendingReviews > 0) {
      actions.push({
        domainId: input.domainId, actionType: 'awaiting_review', priority: nudge('awaiting_review', 10),
        rationale: `${input.pendingReviews} quote-bound proposal${input.pendingReviews === 1 ? ' remains' : 's remain'} after policy auto-accept; human review is still required for the rest.`,
        deterministicSignals: signals, payload: {}, jobType: null, costTier: 'none',
      })
    }
    if (input.duePredictionIds.length > 0 && eligible(input, 'evaluate_prediction')) {
      actions.push({
        domainId: input.domainId, actionType: 'evaluate_prediction', priority: nudge('evaluate_prediction', 25),
        rationale: `${input.duePredictionIds.length} due prediction${input.duePredictionIds.length === 1 ? '' : 's'} have new evidence or a passed deadline.`,
        deterministicSignals: signals,
        payload: { predictionIds: input.duePredictionIds.slice(0, 10) },
        jobType: 'evaluate-market-prediction', costTier: 'standard',
      })
    }
    if (input.contradictingLeads > 0 && eligible(input, 'investigate_counter_evidence')) {
      actions.push({
        domainId: input.domainId, actionType: 'investigate_counter_evidence', priority: nudge('investigate_counter_evidence', 30),
        rationale: `${input.contradictingLeads} contradicting lead${input.contradictingLeads === 1 ? '' : 's'} warrant a bounded counter-evidence investigation${input.strongestDisconfirmingClaim ? `: ${input.strongestDisconfirmingClaim}` : ''}.`,
        deterministicSignals: { ...signals, strongestDisconfirmingClaim: input.strongestDisconfirmingClaim },
        payload: {
          frontierIds: input.queuedFrontierIds.slice(0, 8),
          trigger: 'counter_evidence',
          reason: `Counter-evidence follow-up for ${input.domainId}. Prioritize primary sources that challenge the current causal read${input.strongestDisconfirmingClaim ? ` (recent dissent: ${input.strongestDisconfirmingClaim})` : ''}.`,
        },
        jobType: 'scout-market-research', costTier: 'standard',
      })
    }
    if (input.queuedFrontierIds.length > 0 && eligible(input, 'investigate_broad')) {
      actions.push({
        domainId: input.domainId, actionType: 'investigate_broad', priority: nudge('investigate_broad', 35),
        rationale: `${input.queuedFrontierIds.length} unresolved causal frontier${input.queuedFrontierIds.length === 1 ? '' : 's'} need broad, cited investigation including disconfirming material.`,
        deterministicSignals: signals,
        payload: {
          frontierIds: input.queuedFrontierIds.slice(0, 8),
          trigger: 'frontier_gap',
          reason: `Frontier investigation for ${input.domainId}: ${input.queuedFrontierIds.length} unresolved causal frontier(s) need broad, cited research including disconfirming material.`,
        },
        jobType: 'scout-market-research', costTier: 'standard',
      })
    }
    if (input.reliableRecurringPublishers > 0 && eligible(input, 'verify_recurring_source')) {
      actions.push({
        domainId: input.domainId, actionType: 'verify_recurring_source', priority: nudge('verify_recurring_source', 45),
        rationale: `${input.reliableRecurringPublishers} publisher${input.reliableRecurringPublishers === 1 ? '' : 's'} appeared as recurring-source candidates across multiple scout runs; verify without admitting a source.`,
        deterministicSignals: signals, payload: { trigger: 'orchestration' }, jobType: 'scout-world-sources', costTier: 'cheap',
      })
    }
    if ((input.evidenceReceived > 0 || input.freshGovernedEvidence >= 3) && eligible(input, 'critic_revision')) {
      actions.push({
        domainId: input.domainId, actionType: 'critic_revision', priority: nudge('critic_revision', 55),
        rationale: input.evidenceReceived > 0
          ? `${input.evidenceReceived} frontier item${input.evidenceReceived === 1 ? ' has' : 's have'} accepted governed evidence and need bounded analyst-plus-critic reassessment.`
          : `${input.freshGovernedEvidence} fresh governed observations warrant a bounded research/critic refresh, not a thesis promotion.`,
        deterministicSignals: signals, payload: { trigger: 'orchestration' }, jobType: 'refresh-market-hypothesis-research', costTier: 'strong',
      })
    }
    if (input.approvedSourceCount > 0 && input.freshGovernedEvidence === 0 && eligible(input, 'collect_known_source')) {
      actions.push({
        domainId: input.domainId, actionType: 'collect_known_source', priority: nudge('collect_known_source', 65),
        rationale: `${input.approvedSourceCount} approved source${input.approvedSourceCount === 1 ? '' : 's'} have no fresh governed evidence in the planning window; request bounded collection under existing contracts.`,
        deterministicSignals: signals, payload: { trigger: 'orchestration' }, jobType: 'collect-world-source-documents', costTier: 'none',
      })
    }
    if (actions.length === 0) {
      actions.push({
        domainId: input.domainId, actionType: 'no_action', priority: 999,
        rationale: 'No bounded action is currently eligible; preserve budget and wait for new governed evidence, frontier work, or review.',
        deterministicSignals: signals, payload: {}, jobType: null, costTier: 'none',
      })
    }
    return actions.slice(0, 4)
  }).sort((a, b) => a.priority - b.priority || a.domainId.localeCompare(b.domainId))
}

export function applyOrchestrationBudget(
  actions: PlannedOrchestrationAction[],
  options: { researchRunLimit?: number; recurringScoutLimit?: number; predictionLimit?: number } = {},
): { selected: PlannedOrchestrationAction[]; deferred: PlannedOrchestrationAction[]; ambiguous: boolean; costEstimate: Record<string, number> } {
  const researchRunLimit = options.researchRunLimit ?? scheduledMarketResearchRunLimit()
  const recurringScoutLimit = options.recurringScoutLimit ?? 2
  const predictionLimit = options.predictionLimit ?? 10
  const selected: PlannedOrchestrationAction[] = []
  const deferred: PlannedOrchestrationAction[] = []
  let expensiveUsed = 0
  let recurringUsed = 0
  let predictionUsed = 0
  const expensiveCandidates = actions.filter((action) => EXPENSIVE_ACTIONS.has(action.actionType))

  for (const action of actions) {
    if (action.actionType === 'no_action' || action.actionType === 'awaiting_review') {
      selected.push(action)
      continue
    }
    if (action.actionType === 'evaluate_prediction') {
      const ids = Array.isArray(action.payload.predictionIds) ? action.payload.predictionIds.length : 1
      if (predictionUsed + ids > predictionLimit) {
        deferred.push(action)
        continue
      }
      predictionUsed += ids
      selected.push(action)
      continue
    }
    if (action.actionType === 'verify_recurring_source') {
      if (recurringUsed >= recurringScoutLimit) {
        deferred.push(action)
        continue
      }
      recurringUsed += 1
      selected.push(action)
      continue
    }
    if (EXPENSIVE_ACTIONS.has(action.actionType)) {
      if (expensiveUsed >= researchRunLimit) {
        deferred.push(action)
        continue
      }
      expensiveUsed += 1
      selected.push(action)
      continue
    }
    selected.push(action)
  }

  const costEstimate = {
    none: selected.filter((action) => action.costTier === 'none' && action.jobType).length,
    cheap: selected.filter((action) => action.costTier === 'cheap').length,
    standard: selected.filter((action) => action.costTier === 'standard').length,
    strong: selected.filter((action) => action.costTier === 'strong').length,
    deferred: deferred.length,
  }
  return {
    selected,
    deferred,
    ambiguous: expensiveCandidates.length > researchRunLimit,
    costEstimate,
  }
}

export function validateOrchestrationPlanSelection(
  value: unknown,
  eligibleKeys: string[],
  limit: number,
): { selectedKeys: string[]; rationale: string } {
  const payload = record(value)
  const raw = Array.isArray(payload.selectedKeys) ? payload.selectedKeys : []
  const allowed = new Set(eligibleKeys)
  const selectedKeys = [...new Set(raw.filter((item): item is string => typeof item === 'string' && allowed.has(item)))].slice(0, Math.max(1, limit))
  if (selectedKeys.length < 1) throw new Error('Orchestration plan must select at least one eligible expensive action')
  const rationale = typeof payload.rationale === 'string' ? payload.rationale.trim() : ''
  if (rationale.length < 8 || rationale.length > 1200) throw new Error('Invalid orchestration plan rationale')
  return { selectedKeys, rationale }
}

export function buildOrchestrationPlanPrompt(candidates: PlannedOrchestrationAction[], limit: number): string {
  return [
    'You are Stratum\'s market-research orchestration arbitrator.',
    'Select only from the eligible expensive actions below. Do not invent action types, accept evidence, publish a thesis, or recommend a trade.',
    `Choose up to ${limit} actions that most reduce unresolved causal risk across domains. Prefer counter-evidence and fresh evidence-driven critic work over redundant broad scouts.`,
    `CANDIDATES: ${JSON.stringify(candidates.map((action) => ({
      key: actionKey(action),
      domainId: action.domainId,
      actionType: action.actionType,
      priority: action.priority,
      costTier: action.costTier,
      signals: action.deterministicSignals,
      rationale: action.rationale,
    })))}`,
  ].join('\n\n')
}

export async function rankExpensiveOrchestrationActions(
  expensive: PlannedOrchestrationAction[],
  limit: number,
  runner?: (prompt: string) => Promise<CodexExecResult<{ selectedKeys: string[]; rationale: string }>>,
): Promise<{ selected: PlannedOrchestrationAction[]; deferred: PlannedOrchestrationAction[]; plannerOutput: Record<string, unknown> | null }> {
  if (expensive.length <= limit) {
    return { selected: expensive, deferred: [], plannerOutput: null }
  }
  const eligibleKeys = expensive.map(actionKey)
  try {
    const run = runner ?? ((prompt: string) => runCodexJson({
      prompt,
      schemaPath: 'schemas/market-orchestration-plan.schema.json',
      validate: (value) => validateOrchestrationPlanSelection(value, eligibleKeys, limit),
      model: selectMarketModel('research_planning').model,
      timeoutMs: 3 * 60 * 1_000,
    }))
    const result = await run(buildOrchestrationPlanPrompt(expensive, limit))
    const chosen = new Set(result.data.selectedKeys)
    const selected = expensive.filter((action) => chosen.has(actionKey(action))).slice(0, limit)
    const deferred = expensive.filter((action) => !chosen.has(actionKey(action)))
    if (selected.length === 0) throw new Error('Model returned no selectable actions')
    return {
      selected,
      deferred,
      plannerOutput: { selectedKeys: result.data.selectedKeys, rationale: result.data.rationale, model: result.metadata.model, provider: result.metadata.provider },
    }
  } catch (cause) {
    return {
      selected: expensive.slice(0, limit),
      deferred: expensive.slice(limit),
      plannerOutput: { fallback: 'deterministic', error: cause instanceof Error ? cause.message : String(cause) },
    }
  }
}

function record(value: unknown): RecordValue { return value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {} }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean) : [] }

function publisherKey(lead: RecordValue): string {
  const publisher = String(lead.publisher ?? '').trim().toLowerCase()
  try {
    return `${publisher}|${new URL(String(lead.url ?? '')).hostname}`
  } catch {
    return publisher
  }
}

async function loadInputs(now: Date): Promise<{ inputs: OrchestrationDomainInput[]; marketRegime: string | null }> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const freshAfter = new Date(now.getTime() - 36 * 60 * 60 * 1_000).toISOString()
  const cooldownAfter = new Date(now.getTime() - 6 * 60 * 60 * 1_000).toISOString()
  const [domains, proposals, frontiers, leads, observations, sources, actions, state, predictions] = await Promise.all([
    supabase.from('market_domain_packs').select('id').eq('status', 'active'),
    supabase.from('world_observation_proposals').select('domain_id,world_observation_proposal_reviews(decision)'),
    supabase.from('market_hypothesis_research_frontier').select('id,status,market_hypotheses!inner(scope)').in('status', ['queued', 'evidence_received']),
    supabase.from('market_research_scout_runs').select('domain_id,leads,created_at').eq('status', 'complete').gte('created_at', freshAfter),
    supabase.from('world_observations').select('domain,ingested_at').gte('ingested_at', freshAfter),
    supabase.from('world_source_domains').select('domain_id,world_source_registry!inner(status)').in('world_source_registry.status', ['approved', 'probation']),
    supabase.from('market_orchestration_actions').select('domain_id,action_type,created_at').gte('created_at', cooldownAfter),
    supabase.from('market_states').select('regime').order('generated_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('market_thesis_predictions')
      .select('id,deadline,market_thesis_versions!inner(hypothesis_id,generated_at,data_as_of,market_hypotheses!inner(scope))')
      .eq('result', 'pending')
      .limit(50),
  ])
  const error = domains.error ?? proposals.error ?? frontiers.error ?? leads.error ?? observations.error ?? sources.error ?? actions.error ?? state.error ?? predictions.error
  if (error) throw new Error(`Unable to load market orchestration inputs: ${error.message}`)
  const active = (domains.data ?? []).map((row) => String(row.id))
  const inputByDomain = new Map(active.map((domainId) => [domainId, {
    domainId,
    pendingReviews: 0,
    queuedFrontierIds: [] as string[],
    evidenceReceived: 0,
    reliableRecurringPublishers: 0,
    contradictingLeads: 0,
    strongestDisconfirmingClaim: null as string | null,
    freshGovernedEvidence: 0,
    approvedSourceCount: 0,
    duePredictionIds: [] as string[],
    recentActionTypes: [] as MarketOrchestrationActionType[],
  }]))

  for (const row of proposals.data ?? []) {
    const target = inputByDomain.get(String(row.domain_id))
    const review = record(row.world_observation_proposal_reviews)
    if (target && !review.decision) target.pendingReviews += 1
  }
  for (const row of frontiers.data ?? []) {
    const hypothesis = record(row.market_hypotheses)
    const target = inputByDomain.get(String(hypothesis.scope))
    if (!target) continue
    if (row.status === 'queued') target.queuedFrontierIds.push(String(row.id))
    else target.evidenceReceived += 1
  }

  const recurringByDomain = new Map<string, Map<string, Set<string>>>()
  for (const row of leads.data ?? []) {
    const domainId = String(row.domain_id)
    const target = inputByDomain.get(domainId)
    if (!target) continue
    const runId = String(row.created_at)
    const leadRows = Array.isArray(row.leads) ? row.leads : []
    for (const lead of leadRows) {
      const item = record(lead)
      if (item.supports === 'contradicts') {
        target.contradictingLeads += 1
        if (!target.strongestDisconfirmingClaim && typeof item.claim === 'string') {
          target.strongestDisconfirmingClaim = item.claim.slice(0, 180)
        }
      }
      if (!item.recurringSourceCandidate) continue
      const key = publisherKey(item)
      if (!key) continue
      const domainMap = recurringByDomain.get(domainId) ?? new Map<string, Set<string>>()
      const runs = domainMap.get(key) ?? new Set<string>()
      runs.add(runId)
      domainMap.set(key, runs)
      recurringByDomain.set(domainId, domainMap)
    }
  }
  for (const [domainId, publishers] of recurringByDomain) {
    const target = inputByDomain.get(domainId)
    if (!target) continue
    target.reliableRecurringPublishers = [...publishers.values()].filter((runs) => runs.size >= 2).length
  }

  for (const row of observations.data ?? []) {
    const target = inputByDomain.get(String(row.domain))
    if (target) target.freshGovernedEvidence += 1
  }
  for (const row of sources.data ?? []) {
    const target = inputByDomain.get(String(row.domain_id))
    if (target) target.approvedSourceCount += 1
  }
  for (const row of actions.data ?? []) {
    const target = inputByDomain.get(String(row.domain_id))
    const type = String(row.action_type) as MarketOrchestrationActionType
    if (target && COOLDOWN_ACTIONS.has(type)) target.recentActionTypes.push(type)
  }

  const nowMs = now.getTime()
  for (const row of predictions.data ?? []) {
    const thesis = record(row.market_thesis_versions)
    const hypothesis = record(thesis.market_hypotheses)
    const domainId = String(hypothesis.scope ?? '')
    const target = inputByDomain.get(domainId)
    if (!target) continue
    const deadline = row.deadline ? Date.parse(String(row.deadline)) : Number.NaN
    if (Number.isFinite(deadline) && deadline <= nowMs) {
      target.duePredictionIds.push(String(row.id))
    }
  }

  return { inputs: [...inputByDomain.values()], marketRegime: state.data?.regime ? String(state.data.regime) : null }
}

export async function runMarketResearchOrchestration(input: {
  trigger: 'scheduled' | 'manual'
  now?: Date
  planRunner?: (prompt: string) => Promise<CodexExecResult<{ selectedKeys: string[]; rationale: string }>>
} = { trigger: 'scheduled' }): Promise<{
  runId: string
  planned: number
  enqueued: number
  awaitingReview: number
  autoAccepted: number
  deferred: number
  costEstimate: Record<string, number>
}> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const now = input.now ?? new Date()

  // Prefer no-model work first: clear eligible quote-bound proposals before planning.
  const autoAccept = await autoAcceptEligibleWorldObservationProposals({ limit: 40 })
  const context = await loadInputs(now)
  const researchRunLimit = scheduledMarketResearchRunLimit()
  const plannedAll = planMarketResearchActions(context.inputs, { marketRegime: context.marketRegime })
  const expensive = plannedAll.filter((action) => EXPENSIVE_ACTIONS.has(action.actionType))
  const nonExpensive = plannedAll.filter((action) => !EXPENSIVE_ACTIONS.has(action.actionType))

  let selectedExpensive = expensive
  let deferredExpensive: PlannedOrchestrationAction[] = []
  let plannerOutput: Record<string, unknown> | null = null
  if (expensive.length > researchRunLimit) {
    const ranked = await rankExpensiveOrchestrationActions(expensive, researchRunLimit, input.planRunner)
    selectedExpensive = ranked.selected
    deferredExpensive = ranked.deferred
    plannerOutput = ranked.plannerOutput
  }

  const budgeted = applyOrchestrationBudget([...nonExpensive, ...selectedExpensive], { researchRunLimit })
  const deferred = [
    ...budgeted.deferred,
    ...deferredExpensive.map((action) => ({
      ...action,
      rationale: `${action.rationale} Deferred under research-run budget.`,
    })),
  ]
  const actions = [...budgeted.selected, ...deferred.map((action) => ({ ...action, jobType: null as AgentJobType | null }))]
    .sort((a, b) => a.priority - b.priority || a.domainId.localeCompare(b.domainId))

  const { data: run, error: createError } = await supabase.from('market_orchestration_runs').insert({
    status: 'running',
    trigger: input.trigger,
    market_regime: context.marketRegime,
    input_summary: {
      domainCount: context.inputs.length,
      planner: plannerOutput ? 'deterministic-v2+model' : 'deterministic-v2',
      costEstimate: budgeted.costEstimate,
      autoAccept,
      plannerOutput,
      researchRunLimit,
    },
  }).select('id').single()
  if (createError || !run) throw new Error(`Unable to create market orchestration run: ${createError?.message ?? 'unknown error'}`)

  try {
    let enqueued = 0
    let awaitingReview = 0
    const selectedKeys = new Set(budgeted.selected.map(actionKey))

    for (const action of actions) {
      const deferredAction = !selectedKeys.has(actionKey(action)) && action.actionType !== 'awaiting_review' && action.actionType !== 'no_action'
      let jobId: string | null = null
      let state: 'enqueued' | 'awaiting_review' | 'no_action' | 'skipped' =
        action.actionType === 'awaiting_review' ? 'awaiting_review'
          : action.actionType === 'no_action' ? 'no_action'
            : deferredAction ? 'skipped'
              : 'skipped'

      if (!deferredAction && action.jobType) {
        if (action.actionType === 'evaluate_prediction') {
          const predictionIds = strings(action.payload.predictionIds)
          for (const predictionId of predictionIds) {
            const queued = await enqueueAgentJob('evaluate-market-prediction', { predictionId, trigger: 'orchestration' })
            jobId = queued.id
            if (!queued.deduplicated) enqueued += 1
          }
          state = 'enqueued'
        } else {
          const reason = typeof action.payload.reason === 'string'
            ? action.payload.reason
            : `${action.actionType}: ${action.rationale}`
          const queued = await enqueueAgentJob(action.jobType, {
            domainId: action.domainId,
            reason,
            ...action.payload,
          })
          jobId = queued.id
          state = 'enqueued'
          if (!queued.deduplicated) enqueued += 1
        }
      }
      if (state === 'awaiting_review') awaitingReview += 1
      const { error } = await supabase.from('market_orchestration_actions').insert({
        run_id: run.id,
        domain_id: action.domainId,
        action_type: action.actionType,
        state,
        priority: action.priority,
        rationale: deferredAction ? `${action.rationale} Deferred under research-run budget.` : action.rationale,
        deterministic_signals: action.deterministicSignals,
        job_type: deferredAction ? null : action.jobType,
        job_id: jobId,
      })
      if (error) throw new Error(`Unable to save orchestration action: ${error.message}`)
    }

    const { error: finishError } = await supabase.from('market_orchestration_runs').update({
      status: 'complete', completed_at: new Date().toISOString(),
    }).eq('id', run.id)
    if (finishError) throw new Error(`Unable to complete market orchestration run: ${finishError.message}`)
    return {
      runId: String(run.id),
      planned: actions.length,
      enqueued,
      awaitingReview,
      autoAccepted: autoAccept.accepted,
      deferred: deferred.length,
      costEstimate: budgeted.costEstimate,
    }
  } catch (cause) {
    await supabase.from('market_orchestration_runs').update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      error: cause instanceof Error ? cause.message : String(cause),
    }).eq('id', run.id)
    throw cause
  }
}
