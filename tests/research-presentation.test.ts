import test from 'node:test'
import assert from 'node:assert/strict'

import {
  formatEntryAction,
  researchEvidenceMarkdown,
  researchMemoMarkdown,
} from '../lib/markets/research-presentation.ts'

test('research memo view removes legacy evidence labels without changing analysis copy', () => {
  const content = '**FACT:** Revenue grew 12%.\n\n**VIEW:** Margin expansion is the key debate.\n\nCONSENSUS: EPS is expected to rise.\n\n- **FACT:** AWS demand accelerated.\n- **FACT/VIEW:** Reassess if margins deteriorate.\n\n**VIEW: This entire conclusion was bold in a legacy note.**'
  assert.equal(
    researchMemoMarkdown(content),
    'Revenue grew 12%.\n\nMargin expansion is the key debate.\n\nEPS is expected to rise.\n\n- AWS demand accelerated.\n- Reassess if margins deteriorate.\n\nThis entire conclusion was bold in a legacy note.',
  )
})

test('research memo view leaves ordinary report markdown untouched', () => {
  const content = 'The latest filing shows revenue growth remains durable.\n\n- Catalyst: AWS reacceleration.'
  assert.equal(researchMemoMarkdown(content), content)
})

test('research presentation removes internal source ids while preserving actual markdown links', () => {
  const content = 'Free cash flow fell to $7.7bn. [fmp-financials; sec-filing-5]\n\nRead the [annual report](https://example.com).'
  assert.equal(
    researchMemoMarkdown(content),
    'Free cash flow fell to $7.7bn.\n\nRead the [annual report](https://example.com).',
  )
  assert.equal(
    researchEvidenceMarkdown(`**FACT:** ${content}`),
    `**FACT:** Free cash flow fell to $7.7bn.\n\nRead the [annual report](https://example.com).`,
  )
})

test('research presentation restores escaped emphasis and translates entry-action jargon', () => {
  assert.equal(
    researchMemoMarkdown('Base case implies \\*\\*10.1% upside\\*\\*; nibble rather than establish a full position.'),
    'Base case implies **10.1% upside**; start with a small position rather than establish a full position.',
  )
  assert.equal(formatEntryAction('nibble'), 'Start with a small position')
  assert.equal(formatEntryAction('wait'), 'Wait for a better setup')
})
