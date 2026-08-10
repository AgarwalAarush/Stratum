import test from 'node:test'
import assert from 'node:assert/strict'

import { buildMarketThesisBrief } from '../lib/markets/thesis-brief.ts'
import type { MarketThesisWorkspaceData } from '../lib/markets/types.ts'

const workspace = {
  baseline: { observationIds: ['one', 'two', 'three'] },
  crossDomainLinks: [{ id: 'link-1' }],
  theses: [
    {
      id: 'automation', state: 'active', title: 'Automation bottlenecks', confidence: 68, generatedAt: '2026-08-10T16:00:00.000Z',
      content: { whyNow: 'Qualified automation capacity remains constrained. [af48d5ef-84c6-4962-b3eb-f33c04fcfb6c]', economics: '', expectations: '', sourceLedger: [{ documentId: 'doc-1' }] },
      exposures: [{ id: 'exposure-1' }],
      predictions: [
        { id: 'later', prediction: 'Backlog converts into booked revenue.', expectedDirection: 'up', deadline: '2026-12-31T00:00:00.000Z', evidenceNeeded: '', result: 'pending', evaluatedAt: null },
        { id: 'earlier', prediction: 'Lead times remain extended.', expectedDirection: 'up', deadline: '2026-09-30T00:00:00.000Z', evidenceNeeded: '', result: 'pending', evaluatedAt: null },
      ],
    },
    {
      id: 'archived', state: 'archived', title: 'Archived model', confidence: 99, generatedAt: '2026-08-10T16:00:00.000Z',
      content: { whyNow: 'This must not appear.', economics: '', expectations: '', sourceLedger: [] }, exposures: [], predictions: [],
    },
    {
      id: 'power', state: 'active', title: 'Power scarcity', confidence: 60, generatedAt: '2026-08-10T16:00:00.000Z',
      content: { whyNow: 'Firm power remains a binding condition.', economics: '', expectations: '', sourceLedger: [] }, exposures: [],
      predictions: [{ id: 'power-test', prediction: 'Reserve margins tighten.', expectedDirection: 'up', deadline: '2026-10-01T00:00:00.000Z', evidenceNeeded: '', result: 'pending', evaluatedAt: null }],
    },
  ],
} as unknown as MarketThesisWorkspaceData

test('market thesis brief keeps active models and their upcoming tests in view', () => {
  const brief = buildMarketThesisBrief(workspace)

  assert.ok(brief)
  assert.equal(brief.modelCount, 2)
  assert.equal(brief.observationCount, 3)
  assert.equal(brief.crossDomainLinkCount, 1)
  assert.deepEqual(brief.models.map((model) => model.title), ['Automation bottlenecks', 'Power scarcity'])
  assert.equal(brief.models[0]?.whyNow, 'Qualified automation capacity remains constrained.')
  assert.deepEqual(brief.predictions.map((prediction) => prediction.id), ['earlier', 'power-test', 'later'])
})
