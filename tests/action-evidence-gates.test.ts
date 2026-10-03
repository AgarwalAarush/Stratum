import test from 'node:test'
import assert from 'node:assert/strict'
import { abstention, decisionResearchSourceId, gateRecommendation, hasPotentialSupportedAction, revalidateReviewedBatch, validateGeneratedBatch, type DecisionContext, type DecisionName, type EvidenceRef, type Recommendation } from '../lib/markets/recommendations.ts'
import { validateResearchAdvice } from '../lib/markets/research-advice.ts'
import { type EvidenceAssessment } from '../lib/markets/research-contract.ts'

const capturedAt = '2026-10-01T12:00:00Z'
const sourceId = decisionResearchSourceId('packet-1', 'operations')
const gap = { id: 'packet:cash flow statements', description: 'Cash flow statements are unavailable for the expansion valuation.', availability: 'retrieval_failed' as const, affectedActions: ['buy', 'add'] as const, resolution: 'Retrieve the next reported cash flow statement before adding capital.' }
function advice(stance: 'retain' | 'reduce' | 'exit' | 'undetermined' = 'retain') {
  const dimension = (value: string) => ({ value, reason: 'Captured current operations support this independently assessed conclusion.', sourceIds: ['operations'], changeConditions: ['Reassess if reported operating losses materially worsen.'] })
  return { version: 1, businessView: dimension('mixed'), evidenceSufficiency: dimension('insufficient'), newEntryStance: dimension('wait'), existingPositionStance: dimension(stance) }
}
function assessment(action: 'hold' | 'trim' | 'sell' = 'hold'): EvidenceAssessment {
  return { version: 1, gaps: [{ ...gap, affectedActions: [...gap.affectedActions] }], actionSupport: [{ action, reason: 'Reported operating evidence supports this ownership action; missing expansion cash-flow evidence prevents new risk but does not change this existing-position conclusion.', sourceIds: ['operations'], gapIds: [gap.id], reversalConditions: ['Reported operating losses materially worsen in the next earnings release.'] }] }
}
function fixture(action: 'hold' | 'trim' | 'sell' = 'hold', instrumentType: 'equity' | 'etf' = 'equity') {
  const content = { researchContractVersion: 1, formalRating: 'NOT_RATED', sourceIds: ['operations'], advice: advice(action === 'hold' ? 'retain' : action === 'trim' ? 'reduce' : 'exit'), evidenceAssessment: assessment(action) }
  const research = { id: 'report-1', content }
  const packet = { id: 'packet-1', packet: { sources: [{ id: 'operations', asOf: capturedAt, url: 'https://issuer.example.com/earnings', label: 'Reported operations', source: 'issuer' }], filings: [], events: [], evidenceQuality: { missing: ['cash flow statements'] } } }
  const evidence = (id: string, kind: string, value: unknown): EvidenceRef => ({ id, kind, value, asOf: capturedAt, availableAt: capturedAt, retrievedAt: capturedAt, hash: id, url: null, feed: null })
  const name: DecisionName = { symbol: 'TEST', securityId: 'stable-id', portfolioId: 'account', instrumentType, owned: true, quantity: 10, currentWeightPct: 5, portfolioValue: 10000, cash: 5000, quote: { price: 50, asOf: capturedAt, feed: 'sip' }, research, thesis: { status: 'accepted' }, sources: ['research:report-1', 'packet:packet-1', sourceId], gaps: [`Missing ${instrumentType === 'etf' ? 'fund' : 'company'} evidence: cash flow statements`], providerEvidenceGaps: [{ id: gap.id, description: gap.description }], causalLinks: [], selectionReason: 'Owned: required coverage' }
  const context: DecisionContext = { id: 'manifest', ownerId: 'owner', date: '2026-10-01', cutoff: '2026-10-01T16:00:00Z', policy: 'prospective-v1.7', contracts: { research: 1 }, codeVersion: 'tested', portfolio: [], names: [name], evidence: [evidence('research:report-1', 'research', research), evidence('packet:packet-1', instrumentType === 'etf' ? 'etf_packet' : 'company_packet', packet), evidence(sourceId, instrumentType === 'etf' ? 'etf_source' : 'company_source', { source: packet.packet.sources[0], underlyingSourceId: 'operations', packetId: 'packet-1' })], world: [], market: null, gaps: [], universe: [] }
  const rec: Recommendation = { ...abstention(name, context, 'Fixture decision'), action, sourceIds: [...name.sources], gateReasons: [], forecasts: [], entry: { condition: 'Use the independently supported current-position assessment.', maxPrice: null, targetWeightPct: action === 'hold' ? 5 : action === 'trim' ? 2 : 0 } }
  return { context, name, rec, content, packet }
}

test('independently cited retain, reduce and exit survive unrelated entry gaps for companies and funds', () => {
  for (const instrument of ['equity', 'etf'] as const) for (const action of ['hold', 'trim', 'sell'] as const) {
    const { context, rec } = fixture(action, instrument)
    assert.equal(gateRecommendation(rec, context).action, action)
    assert.equal(hasPotentialSupportedAction(context.names[0], context), true)
  }
})

test('a material ownership gap cannot be waived by actionSupport or a long legacy justification', () => {
  const { context, rec, content } = fixture()
  content.evidenceAssessment.gaps[0].affectedActions.push('hold')
  Object.assign(content, { coverageReview: { actionJustifications: { hold: 'Lengthy justification without support. '.repeat(10) } } })
  const blocked = gateRecommendation(rec, context)
  assert.equal(blocked.action, 'no_trade')
  assert.match(blocked.gateReasons.join(' '), /valid frozen, cited action-specific/)
})

test('a genuinely unresolved ownership fact produces its specific blocking reason', () => {
  const { context, rec, content } = fixture()
  content.evidenceAssessment.gaps[0].affectedActions.push('hold')
  content.evidenceAssessment.actionSupport = []
  content.advice = advice('undetermined')
  const blocked = gateRecommendation(rec, context)
  assert.equal(blocked.action, 'no_trade')
  assert.match(blocked.gateReasons.join(' '), /Cash flow statements.*blocks hold.*Retrieve/)
})

test('unknown, uncaptured, future and unreadable support citations fail closed', () => {
  for (const failure of ['unknown', 'uncaptured', 'future', 'unreadable'] as const) {
    const { context, rec, content, packet } = fixture()
    if (failure === 'unknown') content.evidenceAssessment.actionSupport[0].sourceIds = ['invented']
    if (failure === 'uncaptured') context.evidence = context.evidence.filter(e => e.id !== sourceId)
    if (failure === 'future') context.evidence.find(e => e.id === sourceId)!.availableAt = '2026-10-02T00:00:00Z'
    if (failure === 'unreadable') Object.assign(packet.packet, { researchDocuments: [{ sourceId: 'operations', extractionStatus: 'failed', text: null, capturedAt }] })
    assert.equal(gateRecommendation(rec, context).action, 'no_trade', failure)
  }
})

test('all known gaps must be reviewed, and malformed advice or a detached assessment cannot unlock ownership', () => {
  for (const failure of ['omitted', 'unreviewed', 'advice', 'detached'] as const) {
    const { context, name, rec, content } = fixture()
    if (failure === 'omitted') { content.evidenceAssessment.gaps = []; content.evidenceAssessment.actionSupport[0].gapIds = [] }
    if (failure === 'unreviewed') content.evidenceAssessment.actionSupport[0].gapIds = []
    if (failure === 'advice') Object.assign(content, { advice: {} })
    if (failure === 'detached') { name.evidenceAssessment = assessment(); Object.assign(content, { evidenceAssessment: {} }) }
    assert.equal(gateRecommendation(rec, context).action, 'no_trade', failure)
    assert.equal(hasPotentialSupportedAction(name, context), false, failure)
  }
})

test('independent ownership never relaxes identity, portfolio capture, thesis cutoff or entry controls', () => {
  for (const universal of ['Stable security identity is unavailable', 'Current portfolio capture needs verification', 'Thesis review occurred after the decision cutoff']) {
    const { context, name, rec } = fixture()
    name.gaps.push(universal)
    assert.equal(gateRecommendation(rec, context).action, 'no_trade')
  }
  const { context, rec } = fixture()
  const add = { ...rec, action: 'add' as const, entry: { ...rec.entry, maxPrice: 60, targetWeightPct: 6 } }
  const blocked = gateRecommendation(add, context)
  assert.equal(blocked.action, 'no_trade')
  assert.match(blocked.gateReasons.join(' '), /Missing company evidence|blocks add/)
})

test('decision citations must expose the actual independent support to review', () => {
  const { context, rec } = fixture()
  rec.sourceIds = ['research:report-1', 'packet:packet-1']
  assert.match(gateRecommendation(rec, context).gateReasons.join(' '), /independent sources/)
})

test('legacy rules remain strict and new manifests require a substantive report upgrade', () => {
  const { context, name, rec, content } = fixture()
  Object.assign(content, { researchContractVersion: undefined, advice: undefined, formalRating: 'HOLD' })
  const blocked = gateRecommendation(rec, context)
  assert.equal(blocked.action, 'no_trade')
  assert.match(blocked.gateReasons.join(' '), /contract upgrade/)
  const legacy = { ...context, contracts: undefined }
  assert.equal(gateRecommendation(rec, legacy).action, 'no_trade')
  name.gaps = []
  assert.equal(gateRecommendation(rec, legacy).action, 'hold')
})

test('overall insufficiency permits retain only with explicitly validated action-specific evidence', () => {
  assert.throws(() => validateResearchAdvice(advice(), ['operations']), /Insufficient evidence/)
  assert.doesNotThrow(() => validateResearchAdvice(advice(), ['operations'], { researchContractVersion: 1, evidenceAssessment: assessment() }))
  assert.throws(() => validateResearchAdvice(advice(), ['operations'], { researchContractVersion: 1, evidenceAssessment: { ...assessment(), actionSupport: [] } }), /Insufficient evidence|action-specific support/)
})

test('eligible new entry and every additional support must agree with the cited stance', () => {
  const eligible = advice('undetermined')
  eligible.evidenceSufficiency.value = 'sufficient'
  eligible.newEntryStance.value = 'eligible'
  assert.throws(() => validateResearchAdvice(eligible, ['operations'], { researchContractVersion: 1, evidenceAssessment: { version: 1, gaps: [], actionSupport: [] } }), /buy\/add support/)
  const supported = { version: 1, gaps: [], actionSupport: [{ ...assessment().actionSupport[0], action: 'buy', gapIds: [] }] }
  assert.doesNotThrow(() => validateResearchAdvice(eligible, ['operations'], { researchContractVersion: 1, evidenceAssessment: supported }))
  supported.actionSupport[0].action = 'hold'
  assert.throws(() => validateResearchAdvice(eligible, ['operations'], { researchContractVersion: 1, evidenceAssessment: supported }), /conflicts/)
})

test('publication retains trusted critic vetoes while initial generation cannot invent gate metadata', () => {
  const { context, rec } = fixture()
  const reviewed: Recommendation = { ...rec, action: 'no_trade', proposedAction: 'hold', gateReasons: ['The independent reviewer found an unsupported ownership premise.'], reason: 'Independent review blocked action: the ownership premise lacks captured support.', entry: { ...rec.entry, targetWeightPct: null } }
  const published = revalidateReviewedBatch([reviewed], context)[0]
  assert.equal(published.action, 'no_trade')
  assert.equal(published.proposedAction, 'hold')
  assert.deepEqual(published.gateReasons, reviewed.gateReasons)
  assert.equal(published.reason, reviewed.reason)
  assert.deepEqual(validateGeneratedBatch([reviewed], context).recommendations[0].gateReasons, [])
})
