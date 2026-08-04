import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import {
  buildWorldSourceScoutPrompt,
  scoreWorldSourceCandidate,
  validateWorldSourceContract,
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
  assert.throws(() => validateWorldSourceScoutCandidates({ candidates: [{ ...candidate, domains: ['critical-materials'] }] }, 'ai-power'), /requested known domain/)
  assert.throws(() => validateWorldSourceScoutCandidates({ candidates: [candidate, candidate] }, 'ai-power'), /duplicate/)
  assert.throws(() => validateWorldSourceScoutCandidates({ candidates: [candidate] }, 'not-a-domain'), /Unknown market domain/)
})

test('source score is deterministic and does not treat discovery sources as authoritative', () => {
  const regulatory = scoreWorldSourceCandidate(candidate)
  const discovery = scoreWorldSourceCandidate({ ...candidate, sourceTier: 'discovery', sourceKind: 'html', evidenceClasses: ['discovery'], limitations: ['Opinion-led', 'No primary data'] })
  assert.ok(regulatory > discovery)
  assert.equal(regulatory, scoreWorldSourceCandidate(candidate))
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
})

test('source-control migration makes contracts mandatory for newly governed observations', async () => {
  const [migration, memory, jobs] = await Promise.all([
    readFile(new URL('../supabase/migrations/202608040001_world_source_control_plane.sql', import.meta.url), 'utf8'),
    readFile(new URL('../lib/server/world-memory.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/server/agent-jobs.ts', import.meta.url), 'utf8'),
  ])
  assert.match(migration, /world_source_registry/i)
  assert.match(migration, /world_source_contract_versions/i)
  assert.match(migration, /world_source_domains/i)
  assert.match(migration, /activate_world_source_contract/i)
  assert.match(memory, /resolveApprovedWorldSource/)
  assert.match(memory, /source_registry_id/)
  assert.match(jobs, /'scout-world-sources'/)
})
