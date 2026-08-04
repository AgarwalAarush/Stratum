import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { planMarketResearchActions } from '../lib/server/market-research-orchestrator.ts'

test('market orchestrator selects bounded work without collapsing evidence into a thesis', () => {
  const actions = planMarketResearchActions([
    {
      domainId: 'ai-power', pendingReviews: 2, queuedFrontierIds: ['frontier-a'], evidenceReceived: 0,
      recentRecurringLeads: 1, freshGovernedEvidence: 0, approvedSourceCount: 4, recentActionTypes: [],
    },
    {
      domainId: 'critical-materials', pendingReviews: 0, queuedFrontierIds: [], evidenceReceived: 2,
      recentRecurringLeads: 0, freshGovernedEvidence: 3, approvedSourceCount: 2, recentActionTypes: [],
    },
  ])
  assert.deepEqual(actions.map((action) => action.actionType), [
    'awaiting_review', 'investigate_broad', 'verify_recurring_source', 'critic_revision',
  ])
  assert.equal(actions.find((action) => action.actionType === 'awaiting_review')?.jobType, null)
  assert.equal(actions.find((action) => action.actionType === 'investigate_broad')?.jobType, 'scout-market-research')
  assert.equal(actions.find((action) => action.actionType === 'critic_revision')?.jobType, 'refresh-market-hypothesis-research')
  assert.match(actions[0]?.rationale ?? '', /awaiting governed review/i)
})

test('market orchestrator observes cooldowns and emits a no-action audit record', () => {
  const [action] = planMarketResearchActions([{
    domainId: 'industrial-automation', pendingReviews: 0, queuedFrontierIds: ['frontier-a'], evidenceReceived: 0,
    recentRecurringLeads: 0, freshGovernedEvidence: 0, approvedSourceCount: 0, recentActionTypes: ['investigate_broad'],
  }])
  assert.equal(action?.actionType, 'no_action')
  assert.equal(action?.jobType, null)
})

test('orchestration is worker-queued, durable, and separately visible from source-control review', async () => {
  const [jobs, schedule, route, control, panel, migration] = await Promise.all([
    readFile(new URL('../lib/server/agent-jobs.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/server/agent-schedule.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/markets/world-sources/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/server/world-source-control.ts', import.meta.url), 'utf8'),
    readFile(new URL('../components/markets/WorldSourceControlPanel.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/202608040024_market_research_orchestration.sql', import.meta.url), 'utf8'),
  ])
  assert.match(jobs, /'orchestrate-market-research'/)
  assert.match(jobs, /runMarketResearchOrchestration/)
  assert.match(schedule, /scheduledJob\('orchestrate-market-research'/)
  assert.match(route, /'orchestrate-market-research'/)
  assert.match(control, /market_orchestration_runs/)
  assert.match(control, /market_orchestration_actions/)
  assert.match(panel, /Queue market-wide orchestration/)
  assert.match(panel, /Recent orchestration actions/)
  assert.match(migration, /market_orchestration_runs/)
  assert.match(migration, /market_orchestration_actions/)
  assert.doesNotMatch(migration, /market_thesis_versions.*insert/i)
})
