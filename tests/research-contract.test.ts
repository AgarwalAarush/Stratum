import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { hasCurrentResearchContract, readEvidenceAssessment, requiredEvidenceGaps, validateEvidenceAssessment, type EvidenceAssessment } from '../lib/markets/research-contract.ts'
import { currentResearchContract } from './fixtures/current-research-contract.ts'
import type { ResearchCoverage } from '../lib/markets/research-coverage.ts'

function assessment(): EvidenceAssessment {
  return {version: 1, gaps: [{id: 'packet:cash flow', description: 'Provider cash-flow history was not retrieved.', availability: 'retrieval_failed', affectedActions: ['buy','add'], resolution: 'Retrieve the published cash-flow statements from the issuer filing.'}], actionSupport: [{action: 'hold', reason: 'The primary filing supports retained exposure through cash reserves and current operations; the missing provider series limits new capital.', sourceIds: ['filing'], gapIds: ['packet:cash flow'], reversalConditions: ['Cash reserves fall below the operating runway assumed by the ownership case.']}]}
}

test('every known omission is reviewed, while independent ownership support survives an entry-only gap', () => {
  const required = requiredEvidenceGaps({evidenceQuality: {missing: ['cash flow','cash flow']}})
  assert.deepEqual(required, [{id: 'packet:cash flow', description: 'cash flow'}])
  assert.equal(validateEvidenceAssessment(assessment(), ['filing'], required).actionSupport[0].action, 'hold')
  assert.throws(() => validateEvidenceAssessment({...assessment(),gaps:[]}, ['filing'], required), /omits known gap/)
  const omittedReview = assessment(); omittedReview.actionSupport[0].gapIds = []
  assert.throws(() => validateEvidenceAssessment(omittedReview, ['filing'], required), /every reviewed gap/)
})

test('recorded material ownership gaps cannot be waived by a long justification', () => {
  const blocked = assessment(); blocked.gaps[0].affectedActions.push('hold'); blocked.actionSupport[0].reason = 'The rationale asserts continued ownership without resolving its own blocking gap. '.repeat(100)
  assert.throws(() => validateEvidenceAssessment(blocked, ['filing']), /blocked by its recorded evidence gap/)
  blocked.actionSupport = []
  assert.equal(validateEvidenceAssessment(blocked, ['filing']).actionSupport.length, 0)
})

test('citations, IDs, reviewed gap lists and reversal conditions are checked at publication', () => {
  for (const mutate of [
    (v: EvidenceAssessment) => {v.actionSupport[0].sourceIds = ['unknown']},
    (v: EvidenceAssessment) => {v.actionSupport[0].sourceIds = ['filing','filing']},
    (v: EvidenceAssessment) => {v.actionSupport[0].gapIds = ['unknown']},
    (v: EvidenceAssessment) => {v.actionSupport[0].reversalConditions = []},
    (v: EvidenceAssessment) => {v.gaps.push({...v.gaps[0]})},
    (v: EvidenceAssessment) => {v.actionSupport.push({...v.actionSupport[0]})},
  ]) {
    const invalid = assessment(); mutate(invalid)
    assert.throws(() => validateEvidenceAssessment(invalid, ['filing']))
    assert.equal(readEvidenceAssessment(invalid, ['filing']), null)
  }
})

test('collection failures and unresolved decisive topics receive stable IDs and cannot vanish', () => {
  const coverage = {status: 'failed', topics: [{id:'economics',title:'Commercial economics',decisive:true,sourceIds:[],unresolvedQuestions:['The source did not disclose product margins.']}]} as unknown as ResearchCoverage
  const required = requiredEvidenceGaps({researchCoverage: coverage})
  assert.deepEqual(required.map(g => g.id), ['coverage:collection_failed','coverage:topic_discovery_incomplete','topic:economics'])
  const gaps = required.map(g => ({...g,availability: g.availability ?? 'not_disclosed',affectedActions: ['buy','add'],resolution: 'Revisit the next issuer filing and retry the failed capture.'}))
  assert.doesNotThrow(() => validateEvidenceAssessment({version:1,gaps,actionSupport:[]}, [], required))
  gaps[0].availability = 'not_disclosed'
  assert.throws(() => validateEvidenceAssessment({version:1,gaps,actionSupport:[]}, [], required), /misstates collection status/)
})

test('a current version label needs valid cited advice and all known gaps before reuse', () => {
  const report = currentResearchContract('filing')
  assert.equal(hasCurrentResearchContract(report,{sources:[{id:'filing'}]}),true)
  assert.equal(hasCurrentResearchContract({...report,advice:null}),false)
  assert.equal(hasCurrentResearchContract(report,{sources:[{id:'other'}]}),false)
  assert.equal(hasCurrentResearchContract(report,{sources:[{id:'filing'}],evidenceQuality:{missing:['cash flow']}}),false)
  assert.equal(hasCurrentResearchContract({...report,evidenceAssessment:assessment()}, {sources:[{id:'filing'}],evidenceQuality:{missing:['cash flow']}}),true)
})

test('an eligible new-capital conclusion requires independent cited buy or add support', () => {
  const report = currentResearchContract('filing')
  report.advice.newEntryStance.value = 'eligible'
  report.advice.existingPositionStance.value = 'undetermined'
  report.evidenceAssessment.actionSupport = []
  assert.equal(hasCurrentResearchContract(report),false)
  report.evidenceAssessment.actionSupport = [{action:'buy',reason:'Primary operating evidence and the entry valuation support the current allocation.',sourceIds:['filing'],gapIds:[],reversalConditions:['Operating evidence contradicts the central premise.']}]
  assert.equal(hasCurrentResearchContract(report),true)
  report.advice.newEntryStance.value = 'wait'
  assert.equal(hasCurrentResearchContract(report),false)
})

test('generation schemas require the complete report contract and constrain action values', async () => {
  for (const name of ['equity-research','etf-research','company-research-bundle']) {
    const schema = JSON.parse(await readFile(new URL(`../schemas/${name}.schema.json`,import.meta.url),'utf8'))
    const report = name === 'company-research-bundle' ? schema.properties.research : schema
    assert.ok(report.required.includes('researchContractVersion'))
    assert.ok(report.required.includes('evidenceAssessment'))
    assert.deepEqual(report.properties.researchContractVersion.enum,[1])
    assert.deepEqual(report.properties.evidenceAssessment.properties.actionSupport.items.properties.action.enum,['buy','add','hold','trim','sell'])
  }
})
