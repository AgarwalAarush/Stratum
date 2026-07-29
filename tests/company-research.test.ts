import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { validateEquityResearch } from '../lib/server/company-research.ts'

const sectionIds = [
  'executive_summary',
  'variant_view',
  'business_model',
  'industry_structure',
  'competitive_position',
  'management_and_governance',
  'historical_financials',
  'earnings_quality',
  'forward_estimates',
  'valuation',
  'catalysts',
  'risks',
  'scenario_analysis',
  'thesis_monitoring',
  'sources_and_method',
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
      content: 'Source-grounded analysis.',
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
})

test('research persistence migration creates immutable owned versions and sources', async () => {
  const sql = await readFile(new URL('../supabase/migrations/202607280003_research_portfolio_and_monitoring.sql', import.meta.url), 'utf8')
  assert.match(sql, /create table if not exists public\.company_packets/i)
  assert.match(sql, /create table if not exists public\.equity_research_notes/i)
  assert.match(sql, /unique \(owner_id, symbol, version\)/i)
  assert.match(sql, /create table if not exists public\.equity_research_sources/i)
  assert.match(sql, /enable row level security/i)
})
