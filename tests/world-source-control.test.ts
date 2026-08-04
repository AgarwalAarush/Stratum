import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import {
  buildWorldSourceCoverageScoutPlan,
  buildWorldSourceScoutPrompt,
  scoreWorldSourceCandidate,
  selectCandidateSourcePreflights,
  validateWorldSourceContractTarget,
  validateWorldSourceContract,
  validatePersistedWorldSourceScoutCandidates,
  validateWorldSourceScoutCandidates,
} from '../lib/server/world-source-control.ts'
import { getMarketDomainPack } from '../lib/markets/domain-packs.ts'

const candidate = {
  slug: 'example-grid-operator',
  label: 'Example Grid Operator',
  publisher: 'Example Grid Operator',
  canonicalUrl: 'https://grid.example.org/planning',
  sourceTier: 'regulatory',
  sourceKind: 'dataset',
  evidenceClasses: ['regulatory_data', 'operational_data'],
  domains: ['ai-power'],
  coverage: 'Regional planning, deliverable capacity, and interconnection evidence.',
  whyThisSource: 'It publishes direct operational evidence for the capacity-response node.',
  limitations: ['Regional rather than national coverage.'],
  candidateScore: 84,
}

test('source scout accepts bounded candidates only for a known requested domain', () => {
  const candidates = validateWorldSourceScoutCandidates({ candidates: [candidate] }, 'ai-power')
  assert.equal(candidates[0]?.slug, 'example-grid-operator')
  assert.equal(candidates[0]?.canonicalUrl, 'https://grid.example.org/planning')
  assert.deepEqual(candidates[0]?.evidenceClasses, ['regulatory_data', 'operational_data'])
})

test('source scout rejects broad or ungovernable source output', () => {
  assert.throws(() => validateWorldSourceScoutCandidates({ candidates: [{ ...candidate, canonicalUrl: 'http://grid.example.org/planning' }] }, 'ai-power'), /HTTPS/)
  assert.throws(() => validateWorldSourceScoutCandidates({ candidates: [{ ...candidate, canonicalUrl: 'https://www.sec.gov/edgar/search/index.html' }] }, 'ai-power'), /search or query portal/)
  assert.throws(() => validateWorldSourceScoutCandidates({ candidates: [{ ...candidate, canonicalUrl: 'https://elibrary.ferc.gov/eLibrary/search' }] }, 'ai-power'), /search or query portal/)
  assert.throws(() => validateWorldSourceScoutCandidates({ candidates: [{ ...candidate, canonicalUrl: 'https://example.org/data?query=capacity' }] }, 'ai-power'), /search query/)
  assert.throws(() => validateWorldSourceScoutCandidates({ candidates: [{ ...candidate, slug: 'misrouted-candidate', domains: ['critical-materials'] }] }, 'ai-power'), /misrouted-candidate.*ai-power.*critical-materials/)
  assert.throws(() => validateWorldSourceScoutCandidates({ candidates: [candidate, candidate] }, 'ai-power'), /duplicate/)
  assert.throws(() => validateWorldSourceScoutCandidates({ candidates: [candidate] }, 'not-a-domain'), /Unknown market domain/)
})

test('historical scout artifacts remain auditable when a later admission rule becomes stricter', () => {
  const historical = validatePersistedWorldSourceScoutCandidates({ candidates: [{ ...candidate, canonicalUrl: 'https://www.sec.gov/edgar/search/index.html' }] }, 'ai-power')
  assert.equal(historical[0]?.canonicalUrl, 'https://www.sec.gov/edgar/search/index.html')
})

test('source score is deterministic and does not treat discovery sources as authoritative', () => {
  const regulatory = scoreWorldSourceCandidate(candidate)
  const discovery = scoreWorldSourceCandidate({ ...candidate, sourceTier: 'discovery', sourceKind: 'html', evidenceClasses: ['discovery'], limitations: ['Opinion-led', 'No primary data'] })
  assert.ok(regulatory > discovery)
  assert.equal(regulatory, scoreWorldSourceCandidate(candidate))
})

test('scout follow-up preflights only still-candidate direct targets', () => {
  const selected = selectCandidateSourcePreflights(
    ['Official-Data', 'approved-source', 'official-data', 'blocked-source', 'missing-source'],
    [
      { slug: 'official-data', status: 'candidate' },
      { slug: 'approved-source', status: 'approved' },
      { slug: 'blocked-source', status: 'blocked' },
    ],
  )
  assert.deepEqual(selected, ['official-data'])
})

test('weekly coverage discovery targets only declared gaps without candidate coverage', () => {
  const domain = getMarketDomainPack('macro-policy-geopolitics')!
  const plan = buildWorldSourceCoverageScoutPlan(domain, [
    { id: 'policy-1', status: 'approved', evidenceClasses: ['regulatory_data'] },
    { id: 'policy-candidate', status: 'candidate', evidenceClasses: ['regulatory_data'] },
    { id: 'operations-candidate', status: 'candidate', evidenceClasses: ['operational_data'] },
  ])
  assert.equal(plan?.domainId, domain.id)
  assert.match(plan?.reason ?? '', /market_expectations/)
  assert.doesNotMatch(plan?.reason ?? '', /regulatory_data/)
  assert.match(plan?.reason ?? '', /cannot ingest/i)
  assert.equal(buildWorldSourceCoverageScoutPlan(domain, [
    { id: 'policy-1', status: 'approved', evidenceClasses: ['regulatory_data'] },
    { id: 'policy-2', status: 'candidate', evidenceClasses: ['regulatory_data'] },
    { id: 'operations', status: 'candidate', evidenceClasses: ['operational_data'] },
    { id: 'expectations', status: 'candidate', evidenceClasses: ['market_expectations'] },
  ]), null)
})

test('source contracts constrain hosts, paths, MIME types, and allowed observation kinds', () => {
  const contract = validateWorldSourceContract({
    allowedHosts: ['example.org'], allowedPaths: ['/data', '/reports'], acceptedMimeTypes: ['text/html', 'application/pdf'],
    cadence: 'weekly', assertionsAllowed: ['fact', 'estimate'], retentionDays: 365, notes: 'Primary source with a bounded report path.',
  })
  assert.deepEqual(contract.allowedHosts, ['example.org'])
  assert.deepEqual(contract.assertionsAllowed, ['fact', 'estimate'])
  assert.throws(() => validateWorldSourceContract({ ...contract, allowedHosts: ['https://example.org'] }), /invalid allowed host/)
  assert.throws(() => validateWorldSourceContract({ ...contract, assertionsAllowed: ['recommendation'] }), /invalid observation kinds/)
})

test('a captured document remains bounded by its recorded contract target', () => {
  const strictContract = {
    id: 'contract', sourceId: 'source', version: 1, status: 'retired' as const,
    allowedHosts: ['official.example'], allowedPaths: ['/releases'], acceptedMimeTypes: ['application/pdf'],
    cadence: 'weekly' as const, assertionsAllowed: ['fact' as const], retentionDays: null, notes: 'Historical contract.', createdAt: '2026-08-01T00:00:00.000Z',
  }
  assert.doesNotThrow(() => validateWorldSourceContractTarget(strictContract, 'https://official.example/releases/2026.pdf', 'application/pdf'))
  assert.throws(() => validateWorldSourceContractTarget(strictContract, 'https://official.example/current', 'application/pdf'), /does not permit path/)
})

test('domain packs describe economic systems and source requirements', () => {
  const aiPower = getMarketDomainPack('ai-power')
  const semicap = getMarketDomainPack('semicap-data-center-equipment')
  assert.equal(aiPower?.status, 'active')
  assert.ok(aiPower?.mechanisms.some((mechanism) => mechanism.id === 'interconnection_constraint' && mechanism.required))
  assert.equal(semicap?.parentDomainId, 'ai-power')
  assert.ok(semicap?.sourceRequirements.some((requirement) => requirement.evidenceClass === 'company_disclosure'))
})

test('source-scout prompt forbids automatic admission and unbounded article search', () => {
  const prompt = buildWorldSourceScoutPrompt('ai-power', 'coverage gap: regional queue data')
  assert.match(prompt, /candidate status/i)
  assert.match(prompt, /Do not return search-result pages/i)
  assert.match(prompt, /do not form a market view/i)
  assert.match(prompt, /exact requested domain ID "ai-power"/i)
})

test('source-scout output schema stays within Codex structured-output compatibility', async () => {
  const schema = JSON.parse(await readFile(new URL('../schemas/world-source-scout.schema.json', import.meta.url), 'utf8')) as {
    properties: { candidates: { items: { properties: { canonicalUrl: Record<string, unknown> } } } }
  }
  const canonicalUrl = schema.properties.candidates.items.properties.canonicalUrl
  assert.equal(canonicalUrl.format, undefined)
  assert.equal(canonicalUrl.pattern, '^https://')
})

test('failed scout history cannot invalidate the source-control workspace', async () => {
  const control = await readFile(new URL('../lib/server/world-source-control.ts', import.meta.url), 'utf8')
  assert.match(control, /status === 'complete' && Array\.isArray\(row\.candidates\)/)
  assert.match(control, /A failed run legitimately has the empty default candidate list/)
})

test('source-control migration makes contracts mandatory for newly governed observations', async () => {
  const [migration, activationMigration, memory, jobs, adapters, controlRoute, systemPage, controlPanel, controlService] = await Promise.all([
    readFile(new URL('../supabase/migrations/202608040001_world_source_control_plane.sql', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/202608040003_market_domain_activation_events.sql', import.meta.url), 'utf8'),
    readFile(new URL('../lib/server/world-memory.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/server/agent-jobs.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/server/world-sources.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/markets/world-sources/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/markets/system/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/markets/WorldSourceControlPanel.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../lib/server/world-source-control.ts', import.meta.url), 'utf8'),
  ])
  assert.match(migration, /world_source_registry/i)
  assert.match(migration, /world_source_contract_versions/i)
  assert.match(migration, /world_source_domains/i)
  assert.match(migration, /activate_world_source_contract/i)
  assert.match(memory, /resolveApprovedWorldSource/)
  assert.match(memory, /source_registry_id/)
  assert.match(jobs, /'scout-world-sources'/)
  assert.match(activationMigration, /market_domain_pack_events/i)
  assert.match(await readFile(new URL('../supabase/migrations/202608040007_critical_materials_source_packet.sql', import.meta.url), 'utf8'), /critical-materials/)
  assert.match(await readFile(new URL('../supabase/migrations/202608040021_macro_policy_source_packet.sql', import.meta.url), 'utf8'), /macro-policy-geopolitics/)
  assert.match(memory, /isMarketDomainActive/)
  assert.match(memory, /fetchActiveMarketDomainPacks/)
  assert.match(adapters, /listWorldSourceAdapters/)
  assert.match(jobs, /domain \$\{adapter\.domain\} is not active/)
  assert.match(controlRoute, /'activate-domain'/)
  assert.match(controlRoute, /'preflight-candidate'/)
  assert.match(systemPage, /fetchWorldSourceControlWorkspace/)
  assert.match(systemPage, /Promise\.allSettled/)
  assert.match(controlPanel, /Queue bounded source scout/)
  assert.match(controlPanel, /Approve reviewed contract/)
  assert.match(controlPanel, /Why this source:/)
  assert.match(controlPanel, /Deterministic score/)
  assert.match(controlPanel, /prioritizeWorldSourceCandidates\(workspace\.sources, selectedDomain\)/)
  assert.match(controlPanel, /Showing \{visibleCandidates\.length\} of \{scopedCandidates\.length\}/)
  assert.match(controlPanel, /Show 12 more candidates/)
  assert.doesNotMatch(controlPanel, /candidates\.slice\(0, 8\)/)
  assert.match(controlPanel, /proposal\.domainId === selectedDomain\.id/)
  assert.match(controlPanel, /Showing \{visibleProposals\.length\} of \{scopedProposals\.length\}/)
  assert.match(controlPanel, /Show 12 more proposals/)
  assert.doesNotMatch(controlPanel, /workspace\.observationProposals\.slice\(0, 12\)/)
  assert.match(controlPanel, /action: 'approve'/)
  assert.match(controlPanel, /action: 'block'/)
  assert.match(controlPanel, /Block candidate/)
  assert.match(controlPanel, /action: 'activate-domain'/)
  assert.match(controlPanel, /Review domain activation/)
  assert.match(controlPanel, /Preflight direct target/)
  assert.match(controlPanel, /Activation is a human decision/)
  assert.match(controlPanel, /!selectedDomainComplete/)
  assert.match(controlPanel, /payload\.deduplicated/)
  assert.match(controlPanel, /No additional model run was started/)
  assert.match(controlPanel, /No additional probe run was started/)
  assert.match(controlPanel, /Approval activates this contract; it does not ingest evidence or activate a domain/i)
  assert.doesNotMatch(controlPanel, /<select/)
  assert.match(controlPanel, /cannot approve a source, ingest evidence, activate a domain, create a thesis, or move capital/i)
  assert.match(controlService, /world_source_domains/)
  assert.match(controlService, /frontier_ids/)
  assert.match(controlService, /needs a successful worker preflight before approval/)
  assert.match(controlService, /validateWorldSourceContractTarget\(contract as WorldSourceContract, preflight\.resolvedUrl/)
  assert.match(jobs, /frontierIds/)
  assert.match(controlService, /domainIdsBySourceId/)
  assert.match(controlService, /candidateContext/)
  assert.match(controlService, /world_observation_proposals/)
  assert.match(controlPanel, /Quote-bound observation proposals/)
  assert.match(controlPanel, /Capture and triage outcomes/)
  assert.match(controlPanel, /Revise canonical URL/)
  assert.match(controlPanel, /action: 'revise-canonical-url'/)
  assert.match(controlPanel, /not accepted observations/)
  assert.match(controlPanel, /Accept as observation/)
  assert.match(controlPanel, /review-observation-proposal/)
  assert.match(await readFile(new URL('../supabase/migrations/202608040010_world_observation_proposal_reviews.sql', import.meta.url), 'utf8'), /world_observation_proposal_reviews/)
  assert.match(await readFile(new URL('../supabase/migrations/202608040008_world_source_document_captures.sql', import.meta.url), 'utf8'), /world_source_document_captures/)
  assert.match(await readFile(new URL('../supabase/migrations/202608040009_world_observation_proposals.sql', import.meta.url), 'utf8'), /world_observation_proposals/)
  assert.match(await readFile(new URL('../supabase/migrations/202608040012_world_observation_proposal_triage_runs.sql', import.meta.url), 'utf8'), /world_observation_proposal_triage_runs/)
  assert.match(await readFile(new URL('../supabase/migrations/202608040013_world_source_canonical_revisions.sql', import.meta.url), 'utf8'), /revise_world_source_canonical_url/)
  assert.match(await readFile(new URL('../supabase/migrations/202608040016_source_scout_frontier_provenance.sql', import.meta.url), 'utf8'), /frontier_ids/)
})
