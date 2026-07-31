import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import {
  normalizeThesisContent,
  stockThesisContent,
  thesisEntityKey,
  userAuthoredThesisContent,
} from '../lib/markets/theses.ts'
import { evaluateIndustryThesisSignals } from '../lib/markets/thesis-monitoring.ts'
import type { EquityResearchNote } from '../lib/markets/types.ts'

const research = {
  id: 'note-1', symbol: 'ACME', version: 2, status: 'complete', formalRating: 'BUY', entryAction: 'wait',
  investmentThesis: 'ACME can compound earnings as product-led growth and improving mix drive durable operating leverage.',
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

test('thesis keys keep stock and GICS sub-industry records distinct', () => {
  assert.equal(thesisEntityKey('stock', { symbol: 'acme' }), 'stock:ACME')
  assert.equal(thesisEntityKey('sub_industry', { sector: 'Technology', subIndustry: 'Application Software' }), 'sub-industry:Technology:Application Software')
})

test('a stock thesis derives concise decision context from structured research', () => {
  const thesis = stockThesisContent(research)
  assert.equal(thesis.headline, research.investmentThesis)
  assert.equal(thesis.keyDebate, research.keyDebate)
  assert.equal(thesis.fastestKillSignal, research.fastestKillSignal)
  assert.equal(thesis.confidence, 72)
  assert.deepEqual(thesis.catalysts, ['Earnings', 'Estimate revision'])
  assert.deepEqual(thesis.invalidation, ['Bookings decline', 'Margins contract'])
})

test('direct intake preserves a declarative user view without turning it into a research question', () => {
  const thesis = userAuthoredThesisContent({
    entityType: 'stock',
    symbol: 'INTC',
    statement: 'Intel’s selloff underprices the strategic value of its U.S. fabs and advanced packaging as AI compute demand broadens.',
    mispricing: 'The market is focused on near-term foundry losses instead of domestic capacity value.',
    keyDebate: 'Can utilization improve before cash burn overwhelms the upside?',
    fastestKillSignal: 'Another major process delay with no external foundry wins.',
  })
  assert.equal(thesis.headline, 'Intel’s selloff underprices the strategic value of its U.S. fabs and advanced packaging as AI compute demand broadens.')
  assert.equal(thesis.summary, 'The market is focused on near-term foundry losses instead of domestic capacity value.')
  assert.equal(thesis.keyDebate, 'Can utilization improve before cash burn overwhelms the upside?')
  assert.deepEqual(thesis.invalidation, ['Another major process delay with no external foundry wins.'])
  assert.equal(thesis.confidence, 50)
})

test('direct intake rejects a question in place of a thesis statement', () => {
  assert.throws(() => userAuthoredThesisContent({
    entityType: 'stock',
    symbol: 'MSFT',
    statement: 'Is Microsoft oversold?',
  }), /should state what you believe/)
})

test('direct stock intake queues full research after preserving the authored proposal', async () => {
  const route = await readFile(new URL('../app/api/markets/theses/route.ts', import.meta.url), 'utf8')
  assert.match(route, /proposeUserAuthoredThesis/)
  assert.match(route, /addSymbolToPrimaryWatchlist/)
  assert.match(route, /refresh-market-screener/)
  assert.match(route, /generate-company-research/)
  assert.match(route, /reason: 'thesis-intake'/)
  assert.match(route, /The authored proposal is durable even if background enrichment/)
})

test('legacy question-led thesis records render an affirmative belief and preserve the debate separately', () => {
  const thesis = normalizeThesisContent({
    headline: 'Can margins expand fast enough?',
    summary: 'The market prices a durable slowdown.',
    coreBelief: '**VIEW:** Reported execution is improving as product mix shifts toward recurring revenue. A second sentence is supporting detail.',
    nextQuestion: 'Bookings decline for two quarters.',
    invalidation: ['Bookings decline for two quarters.'],
    confidence: 72,
  })
  assert.equal(thesis.headline, 'Reported execution is improving as product mix shifts toward recurring revenue. A second sentence is supporting detail.')
  assert.equal(thesis.keyDebate, 'Can margins expand fast enough?')
  assert.equal(thesis.fastestKillSignal, 'Bookings decline for two quarters.')
})

test('legacy industry placeholders keep the research question separate from the observable belief', () => {
  const thesis = normalizeThesisContent({
    headline: 'Semiconductors: candidate activity requires research',
    summary: 'Semiconductors produced two candidates across dislocation discovery.',
    coreBelief: 'Semiconductor equipment selloffs are surfacing attractive entry setups.',
    nextQuestion: 'Did the selloff change the ownership case?',
    invalidation: ['Revenue estimates fall materially.'],
  })
  assert.equal(thesis.headline, 'Semiconductor equipment selloffs are surfacing attractive entry setups.')
  assert.equal(thesis.keyDebate, 'Did the selloff change the ownership case?')
  assert.equal(thesis.fastestKillSignal, 'Revenue estimates fall materially.')
})

test('legacy whether-led stock records fall back to a declarative mispricing statement', () => {
  const thesis = normalizeThesisContent({
    headline: 'Whether Apple can grow quickly enough to justify its valuation.',
    summary: 'The current price already discounts an aggressive earnings recovery.',
    coreBelief: 'Whether Apple can grow quickly enough to justify its valuation.',
  })
  assert.equal(thesis.headline, 'The current price already discounts an aggressive earnings recovery.')
  assert.equal(thesis.keyDebate, 'Whether Apple can grow quickly enough to justify its valuation.')
})

test('legacy research snapshots strip rating and entry-action language from the belief', () => {
  const thesis = normalizeThesisContent({
    headline: 'Can the earnings recovery justify the valuation?',
    summary: 'The market expects a fast recovery.',
    coreBelief: '**VIEW: HOLD; wait rather than initiate at today’s price.** Amazon is a business worth owning as AWS and advertising expand the profit mix. The practical action is wait until the valuation offers more upside.',
  })
  assert.equal(thesis.headline, 'Amazon is a business worth owning as AWS and advertising expand the profit mix.')
})

test('thesis migration preserves owner-scoped immutable versions and review states', async () => {
  const migration = await readFile(new URL('../supabase/migrations/202607300004_investment_theses.sql', import.meta.url), 'utf8')
  assert.match(migration, /create table if not exists public\.investment_theses/)
  assert.match(migration, /references public\.market_users\(id\)/)
  assert.match(migration, /'proposed', 'accepted', 'rejected', 'superseded'/)
  assert.match(migration, /unique \(owner_id, entity_key, version\)/)
})

test('Candidate Scout keeps screening leads out of the thesis library', async () => {
  const candidateScout = await readFile(new URL('../lib/server/candidate-scout.ts', import.meta.url), 'utf8')
  assert.match(candidateScout, /supabase\.from\('market_users'\)\.select\('id'\)/)
  assert.match(candidateScout, /\(marketUsers \?\? \[\]\)\.map\(\(row\) => row\.id\)/)
  assert.doesNotMatch(candidateScout, /proposeIndustryTheses/)
  assert.match(candidateScout, /item_type: 'new_candidate'/)
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
