import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

import {
  buildIntelligenceSourceReferralCandidates,
  inferIntelligenceReferralDomains,
} from '../lib/server/intelligence-source-referrals.ts'

test('existing Intelligence and Markets items become bounded discovery referrals, not evidence', () => {
  const candidates = buildIntelligenceSourceReferralCandidates([
    {
      id: '176d3fbe-6d31-4fc5-9f74-f21b7c04fa6b', scope: 'ai-research', section: 'news-infra-hardware',
      title: 'Utilities warn that data-center electricity demand will strain grid capacity',
      url: 'https://www.utilitydive.com/news/data-center-grid-capacity/', published_at: '2026-08-10T18:00:00.000Z',
      metadata: { topic: 'infra-hardware', publisher: 'Utility Dive' },
    },
    {
      id: '370a2a25-e4ee-418d-9a17-c784da46b633', scope: 'markets', section: 'fmp-stock-news',
      title: 'Copper miners assess new processing capacity after export controls',
      url: 'https://www.example.com/copper-processing', published_at: '2026-08-10T19:00:00.000Z',
      metadata: { source: 'Example Markets' },
    },
  ])
  assert.deepEqual(candidates.map((candidate) => candidate.domainId), ['ai-power', 'critical-materials', 'macro-policy-geopolitics'])
  assert.equal(candidates[0]?.originUrl, 'https://www.utilitydive.com')
  assert.match(candidates[0]?.reason ?? '', /discovery referral only/i)
})

test('classification is deterministic and ignores unsafe aggregation portals', () => {
  assert.deepEqual(
    inferIntelligenceReferralDomains({ title: 'HBM memory chip supply tightens for AI accelerators', scope: 'ai-research', section: 'news-infra-hardware' }).map((item) => item.domainId),
    ['semicap-data-center-equipment'],
  )
  const candidates = buildIntelligenceSourceReferralCandidates([{
    id: '2fb5af10-c99b-4d44-9c5c-a0a6a2c9c419', scope: 'global-news', section: 'news-general', title: 'Defense procurement expands',
    url: 'https://news.google.com/articles/example', published_at: null, metadata: {},
  }])
  assert.deepEqual(candidates, [])
})

test('referral lane is durable, scheduled, and cannot silently become governed evidence', async () => {
  const [migration, jobs, schedule, route, panel] = await Promise.all([
    readFile(new URL('../supabase/migrations/202608110001_intelligence_source_referrals.sql', import.meta.url), 'utf8'),
    readFile(new URL('../lib/server/agent-jobs.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/server/agent-schedule.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/markets/world-sources/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../components/markets/WorldSourceControlPanel.tsx', import.meta.url), 'utf8'),
  ])
  assert.match(migration, /world_source_referrals/)
  assert.match(migration, /enable row level security/)
  assert.match(jobs, /'scan-intelligence-source-referrals'/)
  assert.match(jobs, /materializeIntelligenceSourceReferrals/)
  assert.match(schedule, /scan-intelligence-source-referrals/)
  assert.match(route, /scan-intelligence-source-referrals/)
  assert.match(panel, /Scan Intelligence \+ Markets referrals/)
  assert.match(panel, /not a source contract, quote-bound observation, market thesis input, or company recommendation/i)
})
