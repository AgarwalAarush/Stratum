import assert from 'node:assert/strict'
import test from 'node:test'
import { buildMarketResearchScoutPrompt, validateMarketResearchScoutResult } from '../lib/server/market-research-scout.ts'

const result = {
  leads: [{ title: 'Primary release', publisher: 'Example Agency', url: 'https://example.gov/release', sourceType: 'official release', claim: 'The release reports a measurable capacity change.', evidenceQuote: 'Capacity changed by a measured amount.', supports: 'supports', limitations: ['One jurisdiction only'], recurringSourceCandidate: true }],
  unresolvedQuestions: ['What changed in other jurisdictions?'],
}

test('broad research scout preserves attributable provisional leads without converting them to evidence', () => {
  assert.deepEqual(validateMarketResearchScoutResult(result), result)
  assert.throws(() => validateMarketResearchScoutResult({ ...result, leads: [{ ...result.leads[0], url: 'http://example.gov' }] }), /HTTPS/)
  const prompt = buildMarketResearchScoutPrompt('ai-power', 'Test a capacity constraint')
  assert.match(prompt, /not limited to an existing source registry/i)
  assert.match(prompt, /counter-evidence/i)
  assert.match(prompt, /cannot enter a market observation/i)
})
