import test from 'node:test'
import assert from 'node:assert/strict'

import { CACHE_TTL_SECONDS as AI_NEWS_TTL_SECONDS } from '../app/api/ai-research/ai-news/route.ts'
import { CACHE_TTL_SECONDS as DISCUSSIONS_TTL_SECONDS } from '../app/api/ai-research/discussions/route.ts'
import { CACHE_TTL_SECONDS as REPOS_TTL_SECONDS } from '../app/api/ai-research/repos/route.ts'
import { CACHE_TTL_SECONDS as PAPERS_TTL_SECONDS } from '../app/api/ai-research/papers/route.ts'
import { CACHE_TTL_SECONDS as TOPIC_TTL_SECONDS } from '../app/api/ai-research/news/[topic]/route.ts'
import { CACHE_TTL_SECONDS as FINANCE_DEALS_TTL_SECONDS } from '../app/api/finance/deals/route.ts'
import { CACHE_TTL_SECONDS as FINANCE_EARNINGS_TTL_SECONDS } from '../app/api/finance/earnings/route.ts'
import { CACHE_TTL_SECONDS as FINANCE_REPORTS_TTL_SECONDS } from '../app/api/finance/reports/route.ts'
import { CACHE_TTL_SECONDS as MARKET_EARNINGS_TTL_SECONDS } from '../app/api/markets/earnings-calendar/route.ts'
import { CACHE_TTL_SECONDS as MACRO_TTL_SECONDS } from '../app/api/macro/indicators/route.ts'
import { NEWS_TOPICS } from '../lib/data/rss.ts'
import { cacheControlForTier } from '../lib/server/http-cache.ts'

test('non-paper routes use hourly cached fetch TTL', () => {
  const hourlyTtls = [
    AI_NEWS_TTL_SECONDS,
    DISCUSSIONS_TTL_SECONDS,
    REPOS_TTL_SECONDS,
    FINANCE_DEALS_TTL_SECONDS,
    FINANCE_EARNINGS_TTL_SECONDS,
    FINANCE_REPORTS_TTL_SECONDS,
    MARKET_EARNINGS_TTL_SECONDS,
    MACRO_TTL_SECONDS,
  ]

  for (const ttlSeconds of hourlyTtls) {
    assert.equal(ttlSeconds, 3_600)
  }
})

test('research papers route uses daily TTL', () => {
  assert.equal(PAPERS_TTL_SECONDS, 86_400)
})

test('all AI topic TTL entries are hourly', () => {
  for (const topic of NEWS_TOPICS) {
    assert.equal(TOPIC_TTL_SECONDS[topic], 3_600)
  }
})

test('cache control tiers align to hourly and daily refresh policy', () => {
  assert.match(cacheControlForTier('fast'), /\bs-maxage=3600\b/)
  assert.match(cacheControlForTier('medium'), /\bs-maxage=3600\b/)
  assert.match(cacheControlForTier('slow'), /\bs-maxage=3600\b/)
  assert.match(cacheControlForTier('static'), /\bs-maxage=86400\b/)
})
