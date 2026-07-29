import test from 'node:test'
import assert from 'node:assert/strict'

import { researchMemoMarkdown } from '../lib/markets/research-presentation.ts'

test('research memo view removes legacy evidence labels without changing analysis copy', () => {
  const content = '**FACT:** Revenue grew 12%.\n\n**VIEW:** Margin expansion is the key debate.\n\nCONSENSUS: EPS is expected to rise.'
  assert.equal(
    researchMemoMarkdown(content),
    'Revenue grew 12%.\n\nMargin expansion is the key debate.\n\nEPS is expected to rise.',
  )
})

test('research memo view leaves ordinary report markdown untouched', () => {
  const content = 'The latest filing shows revenue growth remains durable.\n\n- Catalyst: AWS reacceleration.'
  assert.equal(researchMemoMarkdown(content), content)
})
