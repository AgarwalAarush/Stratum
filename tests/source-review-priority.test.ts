import assert from 'node:assert/strict'
import test from 'node:test'
import { getMarketDomainPack } from '../lib/markets/domain-packs.ts'
import { prioritizeWorldSourceCandidates } from '../lib/markets/source-review-priority.ts'
import type { WorldSourceRegistryEntry } from '../lib/markets/types.ts'

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
