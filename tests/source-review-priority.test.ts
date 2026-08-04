import assert from 'node:assert/strict'
import test from 'node:test'
import { getMarketDomainPack } from '../lib/markets/domain-packs.ts'
import { candidateResearchFrontiers, prioritizeWorldObservationProposals, prioritizeWorldSourceCandidates } from '../lib/markets/source-review-priority.ts'
import type { MarketResearchFrontierItem, WorldObservationProposal, WorldSourceDiscoveryRun, WorldSourceRegistryEntry } from '../lib/markets/types.ts'

function source(input: Partial<WorldSourceRegistryEntry> & Pick<WorldSourceRegistryEntry, 'id' | 'label' | 'status' | 'evidenceClasses'>): WorldSourceRegistryEntry {
  return {
    id: input.id, slug: input.id, label: input.label, publisher: 'Primary publisher', canonicalUrl: `https://example.com/${input.id}`,
    sourceTier: 'regulatory', sourceKind: 'dataset', status: input.status, evidenceClasses: input.evidenceClasses,
    discoveredBy: 'scout', discoveryRunId: null, approvedAt: null, blockedReason: null,
    candidateContext: input.candidateContext ?? { coverage: 'Coverage', whyThisSource: 'Why', limitations: [], scoutScore: 80, deterministicScore: 50 },
    domainIds: input.domainIds ?? ['ai-power'], health: null, createdAt: '2026-08-04T00:00:00.000Z', updatedAt: '2026-08-04T00:00:00.000Z',
  }
}

test('candidate review prioritizes declared coverage gaps before model scores', () => {
  const domain = getMarketDomainPack('ai-power')
  assert.ok(domain)
  const ordered = prioritizeWorldSourceCandidates([
    source({ id: 'approved-regulatory', label: 'Approved regulatory', status: 'approved', evidenceClasses: ['regulatory_data'], candidateContext: null }),
    source({ id: 'high-score-industry', label: 'High score industry', status: 'candidate', evidenceClasses: ['industry_research'], candidateContext: { coverage: 'Coverage', whyThisSource: 'Why', limitations: [], scoutScore: 99, deterministicScore: 99 } }),
    source({ id: 'company-gap', label: 'Company gap', status: 'candidate', evidenceClasses: ['company_disclosure'], candidateContext: { coverage: 'Coverage', whyThisSource: 'Why', limitations: [], scoutScore: 40, deterministicScore: 40 } }),
    source({ id: 'operational-gap', label: 'Operational gap', status: 'candidate', evidenceClasses: ['operational_data'], candidateContext: { coverage: 'Coverage', whyThisSource: 'Why', limitations: [], scoutScore: 30, deterministicScore: 30 } }),
  ], domain)
  assert.deepEqual(ordered.map((item) => item.source.id), ['high-score-industry', 'company-gap', 'operational-gap'])
  assert.deepEqual(ordered[0]?.closesCoverageGaps, ['industry_research'])
})

test('review priority becomes deterministic score ordering after all coverage classes are met', () => {
  const domain = getMarketDomainPack('ai-power')
  assert.ok(domain)
  const approved = [
    source({ id: 'regulatory-a', label: 'Regulatory A', status: 'approved', evidenceClasses: ['regulatory_data'], candidateContext: null }),
    source({ id: 'regulatory-b', label: 'Regulatory B', status: 'approved', evidenceClasses: ['regulatory_data'], candidateContext: null }),
    source({ id: 'operational', label: 'Operational', status: 'approved', evidenceClasses: ['operational_data'], candidateContext: null }),
    source({ id: 'company-a', label: 'Company A', status: 'approved', evidenceClasses: ['company_disclosure'], candidateContext: null }),
    source({ id: 'company-b', label: 'Company B', status: 'approved', evidenceClasses: ['company_disclosure'], candidateContext: null }),
    source({ id: 'industry', label: 'Industry', status: 'approved', evidenceClasses: ['industry_research'], candidateContext: null }),
  ]
  const ordered = prioritizeWorldSourceCandidates([...approved,
    source({ id: 'lower', label: 'Lower', status: 'candidate', evidenceClasses: ['company_disclosure'], candidateContext: { coverage: 'Coverage', whyThisSource: 'Why', limitations: [], scoutScore: 90, deterministicScore: 50 } }),
    source({ id: 'higher', label: 'Higher', status: 'candidate', evidenceClasses: ['company_disclosure'], candidateContext: { coverage: 'Coverage', whyThisSource: 'Why', limitations: [], scoutScore: 60, deterministicScore: 70 } }),
  ], domain)
  assert.deepEqual(ordered.map((item) => item.source.id), ['higher', 'lower'])
  assert.deepEqual(ordered[0]?.closesCoverageGaps, [])
})

test('candidate frontier provenance includes every matching bounded discovery run', () => {
  const candidate = source({ id: 'candidate', label: 'Candidate', status: 'candidate', evidenceClasses: ['company_disclosure'] })
  const discoveryRun: WorldSourceDiscoveryRun = {
    id: 'run', domainId: 'ai-power', status: 'complete', trigger: 'frontier_gap', reason: 'Bounded frontier source discovery.', frontierIds: ['lower', 'higher'],
    candidates: [{ slug: 'candidate', label: 'Candidate', publisher: 'Primary publisher', canonicalUrl: 'https://example.com/candidate', sourceTier: 'regulatory', sourceKind: 'dataset', evidenceClasses: ['company_disclosure'], domains: ['ai-power'], coverage: 'Coverage', whyThisSource: 'Why', limitations: [], candidateScore: 80 }],
    provider: 'openai', model: 'cheap-model', generatedAt: '2026-08-04T00:00:00.000Z', error: null, createdAt: '2026-08-04T00:00:00.000Z',
  }
  const frontiers: MarketResearchFrontierItem[] = [
    { id: 'lower', hypothesisId: 'hypothesis', researchVersionId: 'version', question: 'Lower', causalNode: 'lower-priority node', priority: 2, sourceTypes: [], adapterId: null, status: 'deferred', evidenceNeeded: 'Evidence', attemptCount: 0, lastError: null, nextRunAt: null },
    { id: 'higher', hypothesisId: 'hypothesis', researchVersionId: 'version', question: 'Higher', causalNode: 'higher-priority node', priority: 5, sourceTypes: [], adapterId: null, status: 'deferred', evidenceNeeded: 'Evidence', attemptCount: 0, lastError: null, nextRunAt: null },
  ]
  assert.deepEqual(candidateResearchFrontiers(candidate, [discoveryRun], frontiers).map((item) => item.id), ['higher', 'lower'])
})

test('observation review gives a human the highest-materiality open frontier evidence first', () => {
  const proposal = (id: string, partial: Partial<WorldObservationProposal> = {}): WorldObservationProposal => ({
    id, domainId: 'ai-power', mechanism: 'firm_capacity_constraint', assertion: id, kind: 'fact', evidenceQuote: id,
    confidence: 80, materiality: 70, novelty: 60, sourceLabel: 'Governed source', sourceUrl: 'https://example.com', generatedAt: '2026-08-04T00:00:00.000Z', review: null,
    ...partial,
  })
  const frontiers: MarketResearchFrontierItem[] = [
    { id: 'high', hypothesisId: 'hypothesis', researchVersionId: null, question: 'Deliverable capacity?', causalNode: 'firm_capacity_constraint', priority: 5, sourceTypes: [], adapterId: null, status: 'deferred', evidenceNeeded: 'Evidence', attemptCount: 0, lastError: null, nextRunAt: null },
    { id: 'complete', hypothesisId: 'hypothesis', researchVersionId: null, question: 'Resolved', causalNode: 'data_center_load', priority: 5, sourceTypes: [], adapterId: null, status: 'complete', evidenceNeeded: 'Evidence', attemptCount: 0, lastError: null, nextRunAt: null },
  ]
  const ordered = prioritizeWorldObservationProposals([
    proposal('reviewed', { review: { decision: 'accepted', rationale: 'Reviewed', reviewedAt: '2026-08-04T01:00:00.000Z', observationId: 'observation' } }),
    proposal('non-frontier', { mechanism: 'data_center_load', materiality: 99 }),
    proposal('frontier-low', { materiality: 71 }),
    proposal('frontier-high', { materiality: 90 }),
  ], frontiers, 'ai-power')
  assert.deepEqual(ordered.map((item) => item.proposal.id), ['frontier-high', 'frontier-low', 'non-frontier', 'reviewed'])
  assert.deepEqual(ordered[0]?.advancesFrontiers.map((item) => item.id), ['high'])
  assert.deepEqual(ordered[2]?.advancesFrontiers, [])
})
