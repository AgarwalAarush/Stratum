import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { validateEquityResearch } from '../lib/server/company-research.ts'

const sectionIds = [
  'snapshot',
  'business_model_and_moat',
  'financial_profile',
  'market_and_competition',
  'growth_drivers',
  'management_and_capital_allocation',
  'valuation',
  'catalysts',
  'bull_case',
  'base_case',
  'bear_case',
  'risk_factors',
  'sentiment_and_positioning',
  'verdict',
  'kill_criteria',
]

function validResearch() {
  return {
    formalRating: 'HOLD',
    entryAction: 'wait',
    keyDebate: 'Can margins remain durable?',
    mispricing: 'Consensus assumes no operating leverage.',
    fastestKillSignal: 'Gross margin falls below the stated threshold.',
    fairValue: 125,
    entryZoneLow: 90,
    entryZoneHigh: 100,
    confidence: 72,
    sections: sectionIds.map((id) => ({
      id,
      title: id.replaceAll('_', ' '),
      content: Array.from({ length: 18 }, () => 'Source-grounded analysis remains explicit and decision-relevant.').join(' '),
      sourceIds: ['source-1'],
    })),
    sourceIds: ['source-1'],
  }
}

test('equity research validator requires the fixed 15-section contract', () => {
  const result = validateEquityResearch(validResearch())
  assert.equal(result.sections.length, 15)
  assert.equal(result.formalRating, 'HOLD')
  assert.equal(result.entryAction, 'wait')

  const missing = validResearch()
  missing.sections.pop()
  assert.throws(() => validateEquityResearch(missing), /15 required sections/)

  const duplicate = validResearch()
  duplicate.sections[14] = { ...duplicate.sections[0] }
  assert.throws(() => validateEquityResearch(duplicate), /15 required sections/)

  const thin = validResearch()
  thin.sections = thin.sections.map((section) => ({ ...section, content: 'Too thin.' }))
  assert.throws(() => validateEquityResearch(thin), /1,600-3,000 words/)
})

test('research packet includes quarterly evidence, SEC filings, and skill-aligned generation rules', async () => {
  const source = await readFile(new URL('../lib/server/company-research.ts', import.meta.url), 'utf8')
  const schema = await readFile(new URL('../schemas/equity-research.schema.json', import.meta.url), 'utf8')
  assert.match(source, /period: 'quarter', limit: 8/)
  assert.match(source, /data\.sec\.gov\/submissions/)
  assert.match(source, /1,800-2,500 total words/)
  assert.match(source, /Business Model & Moat/)
  assert.match(source, /Kill Criteria must contain 3-5 specific numeric thresholds/)
  assert.match(schema, /"business_model_and_moat"/)
  assert.match(schema, /"sentiment_and_positioning"/)
})

test('research persistence migration creates immutable owned versions and sources', async () => {
  const sql = await readFile(new URL('../supabase/migrations/202607280003_research_portfolio_and_monitoring.sql', import.meta.url), 'utf8')
  assert.match(sql, /create table if not exists public\.company_packets/i)
  assert.match(sql, /create table if not exists public\.equity_research_notes/i)
  assert.match(sql, /unique \(owner_id, symbol, version\)/i)
  assert.match(sql, /create table if not exists public\.equity_research_sources/i)
  assert.match(sql, /enable row level security/i)
})
