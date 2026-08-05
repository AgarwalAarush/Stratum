import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import {
  applyOrchestrationBudget,
  planMarketResearchActions,
  validateOrchestrationPlanSelection,
} from '../lib/server/market-research-orchestrator.ts'

const emptyDomain = {
  pendingReviews: 0, queuedFrontierIds: [] as string[], evidenceReceived: 0,
  reliableRecurringPublishers: 0, contradictingLeads: 0, strongestDisconfirmingClaim: null as string | null,
  freshGovernedEvidence: 0, approvedSourceCount: 0, duePredictionIds: [] as string[], recentActionTypes: [] as never[],
}

test('market orchestrator selects bounded work without collapsing evidence into a thesis', () => {
  const actions = planMarketResearchActions([
    {
      ...emptyDomain,
      domainId: 'ai-power', pendingReviews: 2, queuedFrontierIds: ['frontier-a'],
      reliableRecurringPublishers: 1, contradictingLeads: 1, strongestDisconfirmingClaim: 'Capacity is slipping',
      approvedSourceCount: 4,
    },
    {
      ...emptyDomain,
      domainId: 'critical-materials', evidenceReceived: 2, freshGovernedEvidence: 3, approvedSourceCount: 2,
      duePredictionIds: ['pred-1'],
    },
  ], { marketRegime: 'Risk-Off policy shock' })
  assert.ok(actions.some((action) => action.actionType === 'awaiting_review'))
  assert.ok(actions.some((action) => action.actionType === 'investigate_counter_evidence'))
  assert.ok(actions.some((action) => action.actionType === 'investigate_broad'))
  assert.ok(actions.some((action) => action.actionType === 'evaluate_prediction'))
  assert.ok(actions.some((action) => action.actionType === 'critic_revision'))
  assert.equal(actions.find((action) => action.actionType === 'awaiting_review')?.jobType, null)
  assert.equal(actions.find((action) => action.actionType === 'investigate_broad')?.jobType, 'scout-market-research')
  assert.equal(actions.find((action) => action.actionType === 'critic_revision')?.jobType, 'refresh-market-hypothesis-research')
  assert.ok((actions.find((action) => action.actionType === 'investigate_counter_evidence')?.priority ?? 99) < 35)
})

test('market orchestrator observes cooldowns and emits a no-action audit record', () => {
  const [action] = planMarketResearchActions([{
    ...emptyDomain,
    domainId: 'industrial-automation', queuedFrontierIds: ['frontier-a'], recentActionTypes: ['investigate_broad'],
  }])
  assert.equal(action?.actionType, 'no_action')
  assert.equal(action?.jobType, null)
})

test('budget defers expensive work and marks contention for the model arbitrator', () => {
  const actions = planMarketResearchActions([
    { ...emptyDomain, domainId: 'ai-power', queuedFrontierIds: ['f1'], freshGovernedEvidence: 4, approvedSourceCount: 2 },
    { ...emptyDomain, domainId: 'critical-materials', queuedFrontierIds: ['f2'], evidenceReceived: 1, approvedSourceCount: 2 },
    { ...emptyDomain, domainId: 'semicap-data-center-equipment', contradictingLeads: 2, strongestDisconfirmingClaim: 'Lead times eased', approvedSourceCount: 1 },
  ])
  const budget = applyOrchestrationBudget(actions, { researchRunLimit: 2 })
  assert.equal(budget.ambiguous, true)
  assert.ok(budget.selected.filter((action) => ['investigate_broad', 'investigate_counter_evidence', 'critic_revision'].includes(action.actionType)).length <= 2)
  assert.ok(budget.deferred.length >= 1)
  assert.ok((budget.costEstimate.deferred ?? 0) >= 1)
})

test('orchestration plan validator only accepts eligible keys', () => {
  const selected = validateOrchestrationPlanSelection(
    { selectedKeys: ['ai-power:critic_revision', 'forged:trade', 'ai-power:critic_revision'], rationale: 'Fresh evidence beats another scout.' },
    ['ai-power:critic_revision', 'critical-materials:investigate_broad'],
    1,
  )
  assert.deepEqual(selected.selectedKeys, ['ai-power:critic_revision'])
})

test('orchestration is worker-queued, durable, and separately visible from source-control review', async () => {
  const [jobs, schedule, route, control, panel, migration, review, schema, worker] = await Promise.all([
    readFile(new URL('../lib/server/agent-jobs.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/server/agent-schedule.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/markets/world-sources/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/server/world-source-control.ts', import.meta.url), 'utf8'),
    readFile(new URL('../components/markets/WorldSourceControlPanel.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/202608040025_orchestration_brain_v2.sql', import.meta.url), 'utf8'),
    readFile(new URL('../lib/server/world-observation-review.ts', import.meta.url), 'utf8'),
    readFile(new URL('../schemas/market-orchestration-plan.schema.json', import.meta.url), 'utf8'),
    readFile(new URL('../scripts/markets-worker.ts', import.meta.url), 'utf8'),
  ])
  assert.match(jobs, /'orchestrate-market-research'/)
  assert.match(jobs, /runMarketResearchOrchestration/)
  assert.match(jobs, /processAgentJobs/)
  assert.match(schedule, /scheduledJob\('orchestrate-market-research'/)
  assert.doesNotMatch(schedule, /hour % 6 === 0[\s\S]*refresh-market-hypothesis-research/)
  assert.doesNotMatch(schedule, /hour % 6 === 0[\s\S]*evaluate-market-predictions/)
  assert.match(route, /'orchestrate-market-research'/)
  assert.match(route, /auto-accept-observation-proposals/)
  assert.match(control, /market_orchestration_runs/)
  assert.match(control, /investigate_counter_evidence/)
  assert.match(panel, /Queue market-wide orchestration/)
  assert.match(panel, /Run proposal auto-accept now/)
  assert.match(panel, /Recent orchestration actions/)
  assert.match(panel, /Strongest recent dissent/)
  assert.match(migration, /policy_auto/)
  assert.match(migration, /investigate_counter_evidence/)
  assert.match(migration, /evaluate_prediction/)
  assert.match(migration, /00000000-0000-4000-8000-0000000000aa/)
  assert.match(review, /autoAcceptEligibleWorldObservationProposals/)
  assert.match(review, /POLICY_AUTO_REVIEWER_ID/)
  assert.match(review, /verbatim excerpt/)
  assert.doesNotMatch(migration, /market_thesis_versions.*insert/i)
  assert.match(schema, /selectedKeys/)
  assert.match(worker, /WORKER_CONCURRENCY/)
  assert.match(worker, /processAgentJobs/)
})
