import test from 'node:test'
import assert from 'node:assert/strict'

import { CACHE_TTL_SECONDS as AI_NEWS_CACHE_TTL } from '../app/api/ai-research/ai-news/route.ts'
import { CACHE_TTL_SECONDS as DISCUSSIONS_CACHE_TTL } from '../app/api/ai-research/discussions/route.ts'
import { CACHE_TTL_SECONDS as PAPERS_CACHE_TTL } from '../app/api/ai-research/papers/route.ts'
import { CACHE_TTL_SECONDS as REPOS_CACHE_TTL } from '../app/api/ai-research/repos/route.ts'
import { CACHE_TTL_SECONDS as AI_RESEARCH_NEWS_TTL } from '../app/api/ai-research/news/[topic]/route.ts'
import { CACHE_TTL_SECONDS as GLOBAL_NEWS_TTL } from '../app/api/global-news/news/[topic]/route.ts'
import { NEWS_TOPICS } from '../lib/data/rss.ts'

test('cache TTL for ai-news is correctly set to 3600 seconds', () => {
  assert.equal(AI_NEWS_CACHE_TTL, 3600, 'ai-news cache TTL should be 3600 seconds (1 hour)')
})

test('cache TTL for discussions is correctly set to 3600 seconds', () => {
  assert.equal(DISCUSSIONS_CACHE_TTL, 3600, 'discussions cache TTL should be 3600 seconds (1 hour)')
})

test('cache TTL for papers is correctly set to 86400 seconds', () => {
  assert.equal(PAPERS_CACHE_TTL, 86400, 'papers cache TTL should be 86400 seconds (24 hours)')
})

test('cache TTL for repos is correctly set to 3600 seconds', () => {
  assert.equal(REPOS_CACHE_TTL, 3600, 'repos cache TTL should be 3600 seconds (1 hour)')
})

test('cache TTL for ai-research news topics is correctly set to 3600 seconds', () => {
  for (const topic of Object.keys(AI_RESEARCH_NEWS_TTL)) {
    assert.equal(
      AI_RESEARCH_NEWS_TTL[topic as keyof typeof AI_RESEARCH_NEWS_TTL],
      3600,
      `cache TTL for ai-research news topic '${topic}' should be 3600 seconds (1 hour)`
    )
  }
})

test('cache TTL for global-news topics is correctly set to 3600 seconds', () => {
  for (const topic of Object.keys(GLOBAL_NEWS_TTL)) {
    assert.equal(
      GLOBAL_NEWS_TTL[topic as keyof typeof GLOBAL_NEWS_TTL],
      3600,
      `cache TTL for global-news topic '${topic}' should be 3600 seconds (1 hour)`
    )
  }
})

test('news topics TTL configuration covers exactly all available topics', () => {
  const configuredTopics = [
    ...Object.keys(AI_RESEARCH_NEWS_TTL),
    ...Object.keys(GLOBAL_NEWS_TTL),
  ].sort()
  const availableTopics = [...NEWS_TOPICS].sort()

  assert.deepEqual(
    configuredTopics,
    availableTopics,
    'TTL configuration should cover exactly all available news topics'
  )
})

test('cache TTL values are positive integers', () => {
  const ttlValues = [
    { name: 'ai-news', value: AI_NEWS_CACHE_TTL },
    { name: 'discussions', value: DISCUSSIONS_CACHE_TTL },
    { name: 'papers', value: PAPERS_CACHE_TTL },
    { name: 'repos', value: REPOS_CACHE_TTL },
  ]

  for (const { name, value } of ttlValues) {
    assert.ok(
      Number.isInteger(value) && value > 0,
      `${name} TTL should be a positive integer, got: ${value}`
    )
  }

  // Check all news topic TTL values
  for (const [topic, ttl] of Object.entries(AI_RESEARCH_NEWS_TTL)) {
    assert.ok(
      Number.isInteger(ttl) && ttl > 0,
      `ai-research news topic '${topic}' TTL should be a positive integer, got: ${ttl}`
    )
  }
  for (const [topic, ttl] of Object.entries(GLOBAL_NEWS_TTL)) {
    assert.ok(
      Number.isInteger(ttl) && ttl > 0,
      `global-news topic '${topic}' TTL should be a positive integer, got: ${ttl}`
    )
  }
})

test('cache TTL values follow expected patterns', () => {
  // Short-lived data (frequently changing): 1 hour = 3600 seconds
  const shortLivedTtl = 3600
  const shortLivedEndpoints = ['ai-news', 'discussions', 'repos']

  for (const endpoint of shortLivedEndpoints) {
    let ttl: number
    switch (endpoint) {
      case 'ai-news':
        ttl = AI_NEWS_CACHE_TTL
        break
      case 'discussions':
        ttl = DISCUSSIONS_CACHE_TTL
        break
      case 'repos':
        ttl = REPOS_CACHE_TTL
        break
      default:
        throw new Error(`Unknown endpoint: ${endpoint}`)
    }

    assert.equal(
      ttl,
      shortLivedTtl,
      `${endpoint} should use short-lived cache TTL of ${shortLivedTtl} seconds`
    )
  }

  // Long-lived data (static/slowly changing): 24 hours = 86400 seconds
  const longLivedTtl = 86400
  assert.equal(
    PAPERS_CACHE_TTL,
    longLivedTtl,
    `papers should use long-lived cache TTL of ${longLivedTtl} seconds`
  )

  // All news topics should use short-lived TTL
  for (const [topic, ttl] of Object.entries(AI_RESEARCH_NEWS_TTL)) {
    assert.equal(
      ttl,
      shortLivedTtl,
      `ai-research news topic '${topic}' should use short-lived cache TTL of ${shortLivedTtl} seconds`
    )
  }
  for (const [topic, ttl] of Object.entries(GLOBAL_NEWS_TTL)) {
    assert.equal(
      ttl,
      shortLivedTtl,
      `global-news topic '${topic}' should use short-lived cache TTL of ${shortLivedTtl} seconds`
    )
  }
})
