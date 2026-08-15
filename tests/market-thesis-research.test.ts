import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

import {
  buildPersistedResearchFrontier,
  buildResearchFrontierScoutPlan,
  critiquePrompt,
  hasNearTermEvaluablePrediction,
  nextMarketResearchVersion,
  normalizeResearchVersion,
  researchPrompt,
  shouldQueueMarketHypothesisResearch,
  validateMarketThesisCritique,
  validateMarketThesisResearch,
} from '../lib/server/market-thesis-research.ts'

const sourceIds = ['source-a', 'source-b', 'source-c']

function researchFixture(): any {
  return {
    thesisStatement: 'Firm-power constraints could preserve scarcity rents for proven regional supply.',
    whyNow: 'Large-load demand is arriving before every announced capacity project can serve it.',
    causalChain: [
      { from: 'Large-load growth', to: 'Firm-power demand', mechanism: 'data_center_load', evidenceStatus: 'estimate', sourceIds: ['source-a'] },
      { from: 'Firm-power demand', to: 'Regional scarcity', mechanism: 'firm_capacity_constraint', evidenceStatus: 'observed', sourceIds: ['source-b'] },
      { from: 'Regional scarcity', to: 'Economic capture', mechanism: 'economic_capture', evidenceStatus: 'inference', sourceIds: ['source-c'] },
    ],
    demand: { currentState: 'Large loads are growing.', changeMechanism: 'New capacity is requested.', sourceIds: ['source-a'] },
    supply: { currentState: 'Firm supply takes time.', changeMechanism: 'Projects have lead times.', sourceIds: ['source-b'] },
    bottlenecks: [{ name: 'Interconnection', mechanism: 'Queue timing slows supply.', severity: 'important', whoCapturesEconomics: 'Deliverable capacity owners may capture value.', resolutionSignals: ['Queue completions'], sourceIds: ['source-b'] }],
    economics: { valueChain: 'Generation to load serving.', scarcityRentCapture: 'Only proven delivery can capture rents.', beneficiaries: ['Deliverable capacity'], substitutes: ['Flexible load'], companyCandidates: [], sourceIds: ['source-c'] },
    expectations: { currentNarrative: 'Demand growth is well discussed.', whatAppearsPriced: 'Unknown from the supplied evidence.', variantView: 'Regional delivery matters more than aggregate capacity.', sourceIds: ['source-a'] },
    counterThesis: { statement: 'Supply catches up before scarcity persists.', mechanisms: ['Faster projects'], decisiveTests: ['Delivered capacity additions'], sourceIds: ['source-b'] },
    predictions: [
      { prediction: 'Lead times remain visible.', horizon: '12 months', leadingIndicator: 'Queue data', confirmation: 'Projects remain delayed.', disconfirmation: 'Capacity arrives early.', sourceIds: ['source-b'] },
      { prediction: 'Proven capacity signals improve.', horizon: '18 months', leadingIndicator: 'Contract disclosures', confirmation: 'Backlog rises.', disconfirmation: 'Backlog falls.', sourceIds: ['source-c'] },
    ],
    falsifiers: [
      { condition: 'Demand slows.', observable: 'Load forecasts', thesisImpact: 'Weakens scarcity.', sourceIds: ['source-a'] },
      { condition: 'Supply accelerates.', observable: 'Completed projects', thesisImpact: 'Invalidates rent duration.', sourceIds: ['source-b'] },
    ],
    researchFrontier: [{ question: 'Which regions remain constrained?', causalNode: 'regional scarcity', priority: 5, sourceTypes: ['ISO filings'], evidenceNeeded: 'Regional queue and load evidence' }],
    evidenceGaps: ['Security-level valuation is outside this market model.'],
    confidence: 63,
    sourceIds,
  }
}

test('market thesis research requires a source-backed, internally complete ledger', () => {
  const result = validateMarketThesisResearch(researchFixture(), new Set(sourceIds))
  assert.equal(result.causalChain.length, 3)
  assert.equal(result.sourceIds.length, 3)

  const withoutLedger = researchFixture()
  withoutLedger.sourceIds = ['source-a', 'source-b', 'source-d']
  assert.throws(() => validateMarketThesisResearch(withoutLedger, new Set([...sourceIds, 'source-d'])), /omitted referenced source IDs/)

  const unsupportedClaim = researchFixture()
  unsupportedClaim.causalChain[0].sourceIds = []
  assert.throws(() => validateMarketThesisResearch(unsupportedClaim, new Set(sourceIds)), /needs a source ID/)
})

test('public-company candidates require a valid ticker and exact source-ledger provenance', () => {
  const named = researchFixture()
  named.economics.companyCandidates = [{ companyName: 'Acme Power', symbol: 'ACME', role: 'beneficiary', mechanism: 'Owns named deliverable capacity.', materiality: 82, confidence: 68, sourceIds: ['source-c'] }]
  const validated = validateMarketThesisResearch(named, new Set(sourceIds))
  assert.equal(validated.economics.companyCandidates[0]?.symbol, 'ACME')
  const unsupported = researchFixture()
  unsupported.economics.companyCandidates = [{ ...named.economics.companyCandidates[0]!, sourceIds: [] }]
  assert.throws(() => validateMarketThesisResearch(unsupported, new Set(sourceIds)), /requires source-ledger provenance/)
})

test('market research requires at least one near-term evaluable prediction', () => {
  assert.equal(hasNearTermEvaluablePrediction([{ horizon: '3 months' }]), true)
  assert.equal(hasNearTermEvaluablePrediction([{ horizon: 'within three months' }]), true)
  assert.equal(hasNearTermEvaluablePrediction([{ horizon: '6-12 months' }]), true)
  assert.equal(hasNearTermEvaluablePrediction([{ horizon: 'one year' }]), true)
  assert.equal(hasNearTermEvaluablePrediction([{ horizon: '12-18 months' }]), false)
  assert.equal(hasNearTermEvaluablePrediction([{ horizon: '5 years' }, { horizon: 'eventually' }]), false)
})

test('failed immutable artifacts still advance the next research version', () => {
  assert.equal(nextMarketResearchVersion([{ version: 4 }, { version: 5 }]), 6)
  assert.equal(nextMarketResearchVersion([]), 1)
})

test('legacy research that predates a stricter publication check cannot crash the thesis workspace', () => {
  const legacy = researchFixture()
  legacy.predictions[0].horizon = '18 months'
  legacy.predictions[1].horizon = '2 years'
  const normalized = normalizeResearchVersion({
    id: 'legacy-research', hypothesis_id: 'hyp-1', version: 1, status: 'complete', content: legacy,
    critique: null, source_ids: sourceIds, observation_ids: [], prior_research_version_id: null,
    revision_diff: [], provider: 'codex', model: 'test', critic_provider: 'codex', critic_model: 'test',
    critic_generated_at: '2026-01-01T00:00:00Z', data_as_of: '2026-01-01T00:00:00Z', generated_at: '2026-01-01T00:00:00Z', error: null,
  })
  assert.equal(normalized.status, 'needs_revision')
  assert.equal(normalized.content, null)
  assert.match(normalized.error ?? '', /evaluable prediction/)
})

test('critic output is constrained to the same source ledger', () => {
  assert.throws(() => validateMarketThesisCritique({
    verdict: 'needs_revision', summary: 'The causal bridge needs support.', unsupportedClaims: [], contradictoryEvidence: [], missingAlternatives: [], requiredResearch: ['Find direct capacity evidence for the bridge.'], confidenceAdjustment: -10, sourceIds: ['not-in-ledger'],
  }, new Set(sourceIds)), /unknown source IDs/)
})

test('a revision critique creates bounded governed frontier work instead of an unrestricted retry', () => {
  const critique = validateMarketThesisCritique({
    verdict: 'needs_revision', summary: 'The scarcity-rent bridge needs direct capacity evidence.', unsupportedClaims: ['Capture is inferred too broadly.'], contradictoryEvidence: [], missingAlternatives: [],
    requiredResearch: ['Which approved regional operator or regulator source can establish deliverable capacity by region?'], confidenceAdjustment: -12, sourceIds: [],
  }, new Set(sourceIds))
  const frontier = buildPersistedResearchFrontier(researchFixture().researchFrontier, critique)
  assert.equal(frontier.length, 2)
  assert.deepEqual(frontier[1], {
    question: 'Which approved regional operator or regulator source can establish deliverable capacity by region?',
    causalNode: 'adversarial review', priority: 5, sourceTypes: ['primary or regulatory source'],
    evidenceNeeded: 'Resolve the critic requirement: Which approved regional operator or regulator source can establish deliverable capacity by region?', origin: 'critic',
  })
  assert.throws(() => validateMarketThesisCritique({
    verdict: 'needs_revision', summary: 'Missing support.', unsupportedClaims: [], contradictoryEvidence: [], missingAlternatives: [], requiredResearch: [], confidenceAdjustment: -10, sourceIds: [],
  }, new Set(sourceIds)), /needs 1-8 bounded research requirements/)
  assert.throws(() => validateMarketThesisCritique({
    verdict: 'pass', summary: 'The source ledger supports the analysis.', unsupportedClaims: [], contradictoryEvidence: [], missingAlternatives: [], requiredResearch: ['Unneeded extra work'], confidenceAdjustment: 0, sourceIds: [],
  }, new Set(sourceIds)), /passing critique cannot require additional research/)
})

test('scheduled research does not repeat an unchanged revision frontier', () => {
  assert.equal(shouldQueueMarketHypothesisResearch(null, 0), true)
  assert.equal(shouldQueueMarketHypothesisResearch('complete', 0), false)
  assert.equal(shouldQueueMarketHypothesisResearch('needs_revision', 0), false)
  assert.equal(shouldQueueMarketHypothesisResearch('failed', 0), false)
  assert.equal(shouldQueueMarketHypothesisResearch('needs_revision', 1), true)
})

test('revision prompts feed the prior critique and allow unresolved capture on pass', () => {
  const hypothesis = {
    id: 'hyp-1', ownerId: 'owner-1', title: 'Test', status: 'proposed' as const, scope: 'ai-power', horizon: '2-4y',
    coreMechanism: 'firm_capacity_constraint', causalGraph: [], confidence: 70, unresolvedNodes: ['economic_capture'],
    counterThesis: 'Supply arrives first.', evidence: [], parentHypothesisId: null, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  }
  const sources = [{
    documentId: 'source-a', observationId: 'obs-a', title: 'EIA', publisher: 'EIA', url: 'https://example.com/a',
    tier: 'regulatory', mechanism: 'data_center_load', assertion: 'Load is rising.', extractedKey: null, excerpt: 'Load is rising. Servers were 7% of commercial electricity.',
  }]
  const priorCritique = validateMarketThesisCritique({
    verdict: 'needs_revision', summary: 'Capture is not established.', unsupportedClaims: ['Rents are asserted without contracts.'],
    contradictoryEvidence: [], missingAlternatives: [], requiredResearch: ['Find contractual capture evidence.'], confidenceAdjustment: -20, sourceIds: [],
  }, new Set(sourceIds))
  const revision = researchPrompt(hypothesis, sources, {
    id: 'rv-1', hypothesisId: 'hyp-1', version: 1, status: 'needs_revision', content: validateMarketThesisResearch(researchFixture(), new Set(sourceIds)),
    critique: priorCritique, sourceIds, observationIds: ['obs-a'], priorResearchVersionId: null, revisionDiff: [], provider: 'codex',
    model: 'test', criticProvider: 'codex', criticModel: 'test', criticGeneratedAt: '2026-01-01T00:00:00Z', dataAsOf: '2026-01-01T00:00:00Z',
    generatedAt: '2026-01-01T00:00:00Z', error: null,
  }, 'operator revision after critic')
  assert.match(revision, /PRIOR CRITIQUE/)
  assert.match(revision, /Find contractual capture evidence/)
  assert.match(revision, /Do not invent new facts/)
  assert.match(revision, /integer percent from 0 to 100/)
  assert.match(revision, /companyCandidates/)
  assert.match(revision, /not a recommendation/i)
  const critic = critiquePrompt(hypothesis, validateMarketThesisResearch(researchFixture(), new Set(sourceIds)), sources)
  assert.match(critic, /Economic capture may remain unresolved/)
  assert.match(critic, /assertion and excerpt together/)
  assert.match(critic, /research confidence and evidenceGaps are authoritative/)
})

test('research confidence normalizes 0-1 model fractions into percent', () => {
  const fractional = researchFixture()
  fractional.confidence = 0.22
  assert.equal(validateMarketThesisResearch(fractional, new Set(sourceIds)).confidence, 22)
})

test('research frontiers route to bounded broad research leads for a known domain', () => {
  const plan = buildResearchFrontierScoutPlan('ai-power', [
    { id: 'low', question: 'What capacity is deliverable?', causalNode: 'firm_capacity_constraint', priority: 2, sourceTypes: ['operator data'], evidenceNeeded: 'Delivered capacity by region.' },
    { id: 'high', question: 'Which queues bind?', causalNode: 'interconnection_constraint', priority: 5, sourceTypes: ['ISO filings'], evidenceNeeded: 'Queue timing and withdrawal evidence.' },
    { id: 'middle', question: 'Where is load growing?', causalNode: 'data_center_load', priority: 4, sourceTypes: ['regulator releases'], evidenceNeeded: 'Load forecasts by region.' },
    { id: 'excluded', question: 'What is priced?', causalNode: 'expectations', priority: 1, sourceTypes: [], evidenceNeeded: 'Bounded expectations evidence.' },
  ])
  assert.deepEqual(plan?.frontierIds, ['high', 'middle', 'low'])
  assert.match(plan?.reason ?? '', /broad research/i)
  assert.match(plan?.reason ?? '', /source contract/i)
  assert.equal(buildResearchFrontierScoutPlan('not-a-domain', []), null)
})

test('agent jobs and thesis workspace preserve a bounded research frontier', async () => {
  const [jobs, research, actions, schedule, workspace, memory] = await Promise.all([
    readFile(new URL('../lib/server/agent-jobs.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/server/market-thesis-research.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/markets/market-theses/[id]/actions/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/server/agent-schedule.ts', import.meta.url), 'utf8'),
    readFile(new URL('../components/markets/MarketThesisWorkspace.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../lib/server/world-memory.ts', import.meta.url), 'utf8'),
  ])
  assert.match(jobs, /'deepen-market-hypothesis'/)
  assert.match(jobs, /findDueMarketHypothesisResearch/)
  assert.match(jobs, /route-market-research-frontiers/)
  assert.match(research, /findQueuedResearchFrontierScoutPlans/)
  assert.match(research, /completeEvidenceReceivedResearchFrontiers/)
  assert.match(research, /assessed-by-research:/)
  assert.match(research, /buildPersistedResearchFrontier/)
  assert.match(research, /Resolve the critic requirement/)
  assert.match(research, /linked observation/)
  assert.match(actions, /enqueueAgentJob\('deepen-market-hypothesis'/)
  assert.match(schedule, /orchestrate-market-research/)
  assert.match(jobs, /refresh-market-hypothesis-research/)
  assert.match(workspace, /Candidate discovery awaiting review/)
  assert.match(workspace, /Governed evidence received — analyst revision pending/)
  assert.match(workspace, /contract, health, and human approval/i)
  assert.match(memory, /market_hypothesis_research_frontier/)
})

test('market-thesis promotion requires a completed analyst and critic artifact', async () => {
  const [worldMemory, migration, criticFrontierMigration, criticProvenanceMigration, research] = await Promise.all([
    readFile(new URL('../lib/server/world-memory.ts', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/202608030003_market_hypothesis_research.sql', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/202608040017_backfill_critic_research_frontiers.sql', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/202608040018_market_research_critic_provenance.sql', import.meta.url), 'utf8'),
    readFile(new URL('../lib/server/market-thesis-research.ts', import.meta.url), 'utf8'),
  ])
  assert.match(worldMemory, /eq\('status', 'complete'\)/)
  assert.match(worldMemory, /research\.critique\?\.verdict !== 'pass'/)
  assert.match(worldMemory, /research_version_id: research\.id/)
  assert.match(worldMemory, /verification_status: 'needs_company_research'/)
  assert.match(migration, /add column if not exists research_version_id/)
  assert.match(criticFrontierMigration, /jsonb_array_elements_text/)
  assert.match(criticFrontierMigration, /adapter_id\s*,[\s\S]*'critic'/)
  assert.match(criticFrontierMigration, /not exists/)
  assert.match(criticProvenanceMigration, /critic_provider/)
  assert.match(criticProvenanceMigration, /critic_model/)
  assert.match(research, /critic_provider: critiqueResult\.metadata\.provider/)
  assert.match(research, /criticModel: critiqueResult\.metadata\.model/)
})
