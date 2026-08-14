import test from 'node:test'
import assert from 'node:assert/strict'

import {
  evaluateDecisionAlerts,
  eventResearchDedupeKey,
  killCriterionResearchDedupeKey,
} from '../lib/markets/monitoring.ts'
import type { MaterialEvent } from '../lib/markets/monitoring.ts'
import type { ThesisDecision } from '../lib/markets/types.ts'
import { isMaterialResearchEvent } from '../lib/server/research-monitoring.ts'

const decision: ThesisDecision = {
  id: 'decision-1',
  symbol: 'AAPL',
  version: 1,
  disposition: 'watch',
  formalRating: 'HOLD',
  entryAction: 'wait',
  fairValue: 225,
  entryZoneLow: 180,
  entryZoneHigh: 190,
  conviction: 3,
  nextCatalyst: 'Earnings',
  killCriteria: [
    { id: 'price-floor', description: 'Price falls below 170.', metric: 'price', operator: 'lt', value: 170 },
  ],
  rationale: 'Wait for a better risk/reward.',
  priceAtDecision: 200,
  createdAt: '2026-07-28T20:00:00.000Z',
  investmentThesisId: 'thesis-1',
  researchNoteId: 'research-1',
}

test('event refresh keys are stable per owner and source event', () => {
  const event: MaterialEvent = {
    id: 'filing-1',
    symbol: 'AAPL',
    title: 'AAPL files 10-Q',
    url: 'https://www.sec.gov/example',
    category: 'SEC filing',
    publishedAt: '2026-07-28T20:00:00.000Z',
  }
  assert.equal(
    eventResearchDedupeKey('owner-1', event),
    'research-refresh:owner-1:AAPL:filing-1',
  )
})

test('research refreshes are limited to material thesis events', () => {
  assert.equal(isMaterialResearchEvent('SEC 10-Q', 'AAPL filed 10-Q'), true)
  assert.equal(isMaterialResearchEvent('Press Release · AAPL', 'AAPL issues updated guidance'), true)
  assert.equal(isMaterialResearchEvent('Stock News · AAPL', 'AAPL was mentioned in afternoon trading'), false)
})

test('decision monitoring emits deterministic entry-zone and kill alerts', () => {
  const occurredAt = '2026-07-28T21:00:00.000Z'
  const entry = evaluateDecisionAlerts(decision, 185, occurredAt)
  assert.deepEqual(entry.map((item) => item.type), ['entry_zone_arrival'])
  assert.equal(entry[0]?.dedupeKey, 'entry-zone:decision-1:18500')

  const breach = evaluateDecisionAlerts(decision, 165, occurredAt)
  assert.deepEqual(breach.map((item) => item.type), ['kill_criterion_breach'])
  assert.equal(breach[0]?.dedupeKey, 'kill:decision-1:price-floor')
  assert.equal(
    killCriterionResearchDedupeKey('owner-1', breach[0]!.dedupeKey),
    'research-refresh:owner-1:kill:decision-1:price-floor',
  )
})
