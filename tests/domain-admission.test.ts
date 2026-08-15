import assert from 'node:assert/strict'
import test from 'node:test'

import { buildDomainDecisionCoverage, evaluateDomainAdmission } from '../lib/markets/domain-admission.ts'
import { MARKET_DOMAIN_PACKS } from '../lib/markets/domain-packs.ts'

test('domain admission requires governed source coverage and a maintenance owner', () => {
  const domain = MARKET_DOMAIN_PACKS.find((item) => item.id === 'healthcare-demand-reimbursement')!
  const missing = evaluateDomainAdmission({ domain, maintenanceOwner: '', sourceCoverage: domain.sourceRequirements.map((requirement) => ({ evidenceClass: requirement.evidenceClass, current: 0, required: requirement.minimumSources })) })
  assert.equal(missing.passed, false)
  assert.ok(missing.criteria.some((item) => item.id === 'maintenance_owner' && !item.passed))
  const admitted = evaluateDomainAdmission({ domain, maintenanceOwner: 'Market research owner', sourceCoverage: domain.sourceRequirements.map((requirement) => ({ evidenceClass: requirement.evidenceClass, current: requirement.minimumSources, required: requirement.minimumSources })) })
  assert.equal(admitted.passed, true)
})

test('portfolio exposure ranks domain work without admitting evidence or securities', () => {
  const coverage = buildDomainDecisionCoverage({
    domains: MARKET_DOMAIN_PACKS,
    portfolioSignals: [{ symbol: 'LLY', sector: 'Health Care', subIndustry: 'Pharmaceuticals', owned: true, watchlisted: false, acceptedThesis: true }],
    frontiers: [],
  })
  assert.equal(coverage[0]?.domainId, 'healthcare-demand-reimbursement')
  assert.ok((coverage[0]?.priorityScore ?? 0) > 0)
  assert.deepEqual(coverage[0]?.ownedSymbols, ['LLY'])
})

test('all declared domains expose a complete capture contract', () => {
  assert.ok(MARKET_DOMAIN_PACKS.length >= 8)
  for (const domain of MARKET_DOMAIN_PACKS) {
    assert.ok(domain.economicCapture.rentRecipients.length)
    assert.ok(domain.economicCapture.commoditizedLayers.length)
    assert.ok(domain.economicCapture.durabilityTests.length)
    assert.ok(domain.economicCapture.breakConditions.length)
  }
})
