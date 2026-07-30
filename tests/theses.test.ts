import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { industryThesisContent, stockThesisContent, thesisEntityKey } from '../lib/markets/theses.ts'
import { evaluateIndustryThesisSignals } from '../lib/markets/thesis-monitoring.ts'
import type { CandidateBrief, EquityResearchNote } from '../lib/markets/types.ts'

const research = {
  id: 'note-1', symbol: 'ACME', version: 2, status: 'complete', formalRating: 'BUY', entryAction: 'wait',
  keyDebate: 'Margins can expand without sacrificing growth.', mispricing: 'The market prices a durable slowdown.',
  fastestKillSignal: 'Bookings decline for two quarters.', fairValue: 120, entryZoneLow: 90, entryZoneHigh: 98,
  confidence: 72, provider: 'openai', model: 'test', dataAsOf: '2026-07-30T00:00:00.000Z', generatedAt: '2026-07-30T00:00:00.000Z', error: null,
  sourceIds: ['filing-1'],
  sections: [
    { id: 'snapshot', title: 'Snapshot', content: 'Reported execution is improving.', sourceIds: ['filing-1'] },
    { id: 'catalysts', title: 'Catalysts', content: 'Earnings\nEstimate revision', sourceIds: ['filing-1'] },
    { id: 'kill_criteria', title: 'Kill Criteria', content: 'Bookings decline\nMargins contract', sourceIds: ['filing-1'] },
  ],
} as unknown as EquityResearchNote

const candidate = {
  id: 'candidate-1', symbol: 'ACME', company: 'Acme', sector: 'Technology', subIndustry: 'Application Software',
  tradingDate: '2026-07-30', primaryLane: 'leadership', lanes: ['leadership'],
  tracking: { acceptedThesis: false, watched: false, owned: false },
  selloff: { day: 2, fiveDay: 5, thirtyDay: 12 }, entryContext: 'Establish ownership quality first.',
  whySurfaced: 'ACME moved into leadership.', whatChanged: ['ACME moved into leadership.'],
  industryContext: 'Application Software returned +6.0% over 30 days.', decisiveNumbers: [], valuationSnapshot: '', dimensions: [], signals: [],
  evidence: [{ label: 'Market data', url: 'https://example.com', asOf: '2026-07-30T00:00:00.000Z' }],
  redFlags: ['Valuation is elevated.'], catalyst: 'Earnings expected soon.', nextResearchQuestion: 'Is growth durable?', status: 'new', generatedAt: '2026-07-30T00:00:00.000Z',
} as CandidateBrief

test('thesis keys keep stock and GICS sub-industry records distinct', () => {
  assert.equal(thesisEntityKey('stock', { symbol: 'acme' }), 'stock:ACME')
  assert.equal(thesisEntityKey('sub_industry', { sector: 'Technology', subIndustry: 'Application Software' }), 'sub-industry:Technology:Application Software')
})

test('a stock thesis derives concise decision context from structured research', () => {
  const thesis = stockThesisContent(research)
  assert.equal(thesis.headline, research.keyDebate)
  assert.equal(thesis.confidence, 72)
  assert.deepEqual(thesis.catalysts, ['Earnings', 'Estimate revision'])
  assert.deepEqual(thesis.invalidation, ['Bookings decline', 'Margins contract'])
})

test('an industry thesis preserves candidate evidence and the next research question', () => {
  const thesis = industryThesisContent([candidate])
  assert.equal(thesis?.headline, 'Application Software: candidate activity requires research')
  assert.equal(thesis?.nextQuestion, 'Is growth durable?')
  assert.deepEqual(thesis?.invalidation, ['Valuation is elevated.'])
})

test('thesis migration preserves owner-scoped immutable versions and review states', async () => {
  const migration = await readFile(new URL('../supabase/migrations/202607300004_investment_theses.sql', import.meta.url), 'utf8')
  assert.match(migration, /create table if not exists public\.investment_theses/)
  assert.match(migration, /references public\.market_users\(id\)/)
  assert.match(migration, /'proposed', 'accepted', 'rejected', 'superseded'/)
  assert.match(migration, /unique \(owner_id, entity_key, version\)/)
})

test('Candidate Scout proposes industry theses for every Markets user', async () => {
  const candidateScout = await readFile(new URL('../lib/server/candidate-scout.ts', import.meta.url), 'utf8')
  assert.match(candidateScout, /supabase\.from\('market_users'\)\.select\('id'\)/)
  assert.match(candidateScout, /\(marketUsers \?\? \[\]\)\.map\(\(row\) => row\.id\)/)
  assert.match(candidateScout, /await proposeIndustryTheses\(ownerId, briefs\)/)
})

test('accepted theses atomically become monitored durable objects', async () => {
  const migration = await readFile(new URL('../supabase/migrations/202607300005_thesis_monitoring.sql', import.meta.url), 'utf8')
  assert.match(migration, /create table if not exists public\.thesis_monitors/)
  assert.match(migration, /create table if not exists public\.thesis_monitor_runs/)
  assert.match(migration, /create or replace function public\.review_investment_thesis/)
  assert.match(migration, /on conflict \(owner_id, entity_key\) do update/)
  assert.match(migration, /alter column symbol drop not null/)
})

test('industry monitors ignore noise and flag material leadership deterioration', () => {
  const previous = {
    snapshotId: 'snapshot-1',
    dataAsOf: '2026-07-29T20:00:00.000Z',
    return30d: 12,
    return1y: 25,
    vs50DayAverage: 3,
    rank30d: 4,
  }
  assert.deepEqual(evaluateIndustryThesisSignals(previous, {
    ...previous,
    snapshotId: 'snapshot-2',
    return30d: 9,
    rank30d: 7,
  }), [])
  assert.deepEqual(
    evaluateIndustryThesisSignals(previous, {
      ...previous,
      snapshotId: 'snapshot-3',
      return30d: 4,
      vs50DayAverage: -2,
      rank30d: 18,
    }).map((signal) => signal.reasonCode),
    ['leadership_break', 'momentum_reversal', 'rank_deterioration'],
  )
})
