import assert from 'node:assert/strict'
import test from 'node:test'
import { validateWorldObservationProposals } from '../lib/server/world-observation-proposals.ts'

const contract = { assertionsAllowed: ['fact', 'estimate', 'claim'] }
const extractedText = 'The regulator states that deliverable capacity additions require completed interconnection studies and construction before service can begin. The source does not estimate the timing of individual projects.'

test('cheap observation triage requires an exact quote, declared mechanism, and contract-permitted kind', () => {
  const output = validateWorldObservationProposals({
    proposals: [{
      assertion: 'Deliverable capacity additions depend on completed interconnection studies and construction before service begins.',
      kind: 'fact', mechanism: 'interconnection_constraint',
      evidenceQuote: 'deliverable capacity additions require completed interconnection studies and construction before service can begin',
      confidence: 78, materiality: 64, novelty: 42,
    }],
  }, { domainId: 'ai-power', contract, extractedText })
  assert.equal(output.proposals[0]?.mechanism, 'interconnection_constraint')
})

test('observation triage rejects hallucinated quotes, out-of-pack mechanisms, and disallowed kinds', () => {
  const proposal = {
    assertion: 'Deliverable capacity additions depend on completed interconnection studies and construction before service begins.',
    kind: 'fact', mechanism: 'interconnection_constraint',
    evidenceQuote: 'deliverable capacity additions require completed interconnection studies and construction before service can begin',
    confidence: 78, materiality: 64, novelty: 42,
  }
  assert.throws(() => validateWorldObservationProposals({ proposals: [{ ...proposal, evidenceQuote: 'This statement does not appear in the document anywhere.' }] }, { domainId: 'ai-power', contract, extractedText }), /verbatim excerpt/)
  assert.throws(() => validateWorldObservationProposals({ proposals: [{ ...proposal, mechanism: 'invented_mechanism' }] }, { domainId: 'ai-power', contract, extractedText }), /not declared/)
  assert.throws(() => validateWorldObservationProposals({ proposals: [{ ...proposal, kind: 'inference' }] }, { domainId: 'ai-power', contract, extractedText }), /does not permit/)
})
