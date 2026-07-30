import test from 'node:test'
import assert from 'node:assert/strict'

import { buildCandidateWeeklySummary, candidateWeekStart } from '../lib/markets/candidate-summary.ts'
import type { CandidateBrief } from '../lib/markets/types.ts'

function brief(
  symbol: string,
  subIndustry: string,
  status: CandidateBrief['status'],
  generatedAt = '2026-07-31T21:00:00.000Z',
): CandidateBrief {
  return {
    id: `${symbol}-2026-07-31`,
    symbol,
    company: `${symbol} Corp`,
    sector: 'Technology',
    subIndustry,
    tradingDate: '2026-07-31',
    whySurfaced: `${symbol} has a material leadership transition.`,
    whatChanged: [],
    industryContext: 'Peer context.',
    decisiveNumbers: [],
    valuationSnapshot: 'Peer valuation context.',
    dimensions: [],
    signals: [],
    evidence: [],
    redFlags: [],
    catalyst: 'Earnings',
    nextResearchQuestion: 'Can the transition persist?',
    status,
    generatedAt,
  }
}

test('Candidate Scout weekly summary groups actions and recurring industry context', () => {
  const summary = buildCandidateWeeklySummary([
    brief('AAA', 'Semiconductors', 'new'),
    brief('BBB', 'Semiconductors', 'promoted', '2026-07-31T22:00:00.000Z'),
    brief('CCC', 'Software', 'watchlisted'),
  ], {
    weekEnding: '2026-07-31',
    generatedAt: '2026-08-01T01:00:00.000Z',
  })

  assert.equal(summary.periodStart, '2026-07-27')
  assert.equal(summary.candidateCount, 3)
  assert.equal(summary.uniqueSymbolCount, 3)
  assert.equal(summary.statusCounts.promoted, 1)
  assert.equal(summary.statusCounts.watchlisted, 1)
  assert.deepEqual(summary.leadingSubIndustries[0], {
    label: 'Semiconductors', sector: 'Technology', candidateCount: 2,
  })
  assert.equal(summary.highlights[0]?.symbol, 'BBB')
})

test('Candidate Scout weekly summary calculates a Monday start for any valid calendar date', () => {
  assert.equal(candidateWeekStart('2026-07-31'), '2026-07-27')
  assert.equal(candidateWeekStart('2026-08-02'), '2026-07-27')
})
