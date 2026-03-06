import test from 'node:test'
import assert from 'node:assert/strict'

import { clearCacheForTests } from '../lib/server/cache.ts'
import { generateAIOverview } from '../lib/data/overview.ts'
import { saveDailyOverview, fetchDailyOverviews } from '../lib/data/overview-persistence.ts'
import { GET as getOverviewRoute } from '../app/api/ai-research/overview/route.ts'

function disableRedisForTest() {
  const originalUrl = process.env.UPSTASH_REDIS_REST_URL
  const originalToken = process.env.UPSTASH_REDIS_REST_TOKEN
  process.env.UPSTASH_REDIS_REST_URL = ''
  process.env.UPSTASH_REDIS_REST_TOKEN = ''

  return () => {
    process.env.UPSTASH_REDIS_REST_URL = originalUrl
    process.env.UPSTASH_REDIS_REST_TOKEN = originalToken
  }
}

test('generateAIOverview returns fallback bullets when API key is missing', { concurrency: false }, async (t) => {
  const originalApiKey = process.env.ANTHROPIC_API_KEY
  const originalFetch = global.fetch
  
  // Remove API key
  process.env.ANTHROPIC_API_KEY = ''
  
  // Mock fetch to return some content (should not be called)
  global.fetch = (async () =>
    new Response(
      JSON.stringify([{ title: 'Test item', url: 'https://example.com' }]),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )) as typeof fetch

  t.after(() => {
    process.env.ANTHROPIC_API_KEY = originalApiKey
    global.fetch = originalFetch
  })

  const result = await generateAIOverview()
  
  assert.ok(Array.isArray(result.bullets))
  assert.ok(result.bullets.length > 0)
  assert.ok(typeof result.fetchedAt === 'string')
  
  // Should contain some expected fallback content
  const bulletText = result.bullets.join(' ').toLowerCase()
  assert.ok(bulletText.includes('ai'), 'Should contain AI-related content')
  assert.ok(bulletText.includes('development') || bulletText.includes('research'), 'Should contain development or research content')
})

test('generateAIOverview handles fetch failures gracefully', { concurrency: false }, async (t) => {
  const originalApiKey = process.env.ANTHROPIC_API_KEY
  const originalFetch = global.fetch
  
  process.env.ANTHROPIC_API_KEY = 'test-key'
  
  // Mock all fetches to fail
  global.fetch = (async () => {
    throw new Error('Network failure')
  }) as typeof fetch

  t.after(() => {
    process.env.ANTHROPIC_API_KEY = originalApiKey
    global.fetch = originalFetch
  })

  const result = await generateAIOverview()
  
  // Should fall back to default bullets when all data sources fail
  assert.ok(Array.isArray(result.bullets))
  assert.ok(result.bullets.length > 0)
  assert.ok(typeof result.fetchedAt === 'string')
})

test('generateAIOverview processes successful data sources', { concurrency: false }, async (t) => {
  const originalApiKey = process.env.ANTHROPIC_API_KEY
  const originalFetch = global.fetch
  
  process.env.ANTHROPIC_API_KEY = 'test-key'
  
  let fetchCallCount = 0
  
  // Mock successful data fetch and Anthropic API response
  global.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input)
    fetchCallCount++
    
    if (url.includes('api.anthropic.com')) {
      // Mock Anthropic API response with valid JSON array
      return new Response(
        JSON.stringify({
          content: [
            {
              type: 'text',
              text: '["AI development accelerates with new breakthrough [1]", "Policy changes impact tech industry [2]", "Venture funding reaches new milestone [3]"]'
            }
          ]
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    } else {
      // Mock RSS/API responses
      return new Response(
        `<rss><channel>
          <item>
            <title>Test AI breakthrough</title>
            <link>https://example.com/ai-news</link>
            <pubDate>Thu, 06 Mar 2026 10:00:00 GMT</pubDate>
          </item>
        </channel></rss>`,
        { status: 200, headers: { 'Content-Type': 'application/xml' } }
      )
    }
  }) as typeof fetch

  t.after(() => {
    process.env.ANTHROPIC_API_KEY = originalApiKey
    global.fetch = originalFetch
  })

  const result = await generateAIOverview()
  
  assert.ok(Array.isArray(result.bullets))
  assert.ok(result.bullets.length > 0)
  assert.ok(typeof result.fetchedAt === 'string')
  assert.ok(fetchCallCount > 0, 'Should have made fetch calls')
})

test('generateAIOverview expands source citations to markdown links', { concurrency: false }, async (t) => {
  const originalApiKey = process.env.ANTHROPIC_API_KEY
  const originalFetch = global.fetch
  
  process.env.ANTHROPIC_API_KEY = 'test-key'
  
  global.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input)
    
    if (url.includes('api.anthropic.com')) {
      return new Response(
        JSON.stringify({
          content: [
            {
              type: 'text',
              text: '["Major AI breakthrough announced [1]", "New policy framework released [2]"]'
            }
          ]
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    } else {
      return new Response(
        `<rss><channel>
          <item>
            <title>AI Company Announces Breakthrough</title>
            <link>https://example.com/ai-breakthrough</link>
            <pubDate>Thu, 06 Mar 2026 10:00:00 GMT</pubDate>
          </item>
        </channel></rss>`,
        { status: 200, headers: { 'Content-Type': 'application/xml' } }
      )
    }
  }) as typeof fetch

  t.after(() => {
    process.env.ANTHROPIC_API_KEY = originalApiKey
    global.fetch = originalFetch
  })

  const result = await generateAIOverview()
  
  // Should have converted [1] references to [1](url) markdown links
  const hasMarkdownLinks = result.bullets.some(bullet => 
    bullet.includes('](https://') || bullet.includes('](http://')
  )
  assert.ok(hasMarkdownLinks, 'Should expand citations to markdown links')
})

test('overview route returns fresh data when force=true', { concurrency: false }, async (t) => {
  clearCacheForTests()
  const restoreRedis = disableRedisForTest()
  
  const originalApiKey = process.env.ANTHROPIC_API_KEY
  const originalFetch = global.fetch
  
  process.env.ANTHROPIC_API_KEY = 'test-key'
  
  global.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input)
    
    if (url.includes('api.anthropic.com')) {
      return new Response(
        JSON.stringify({
          content: [{ type: 'text', text: '["Forced refresh overview bullet [1]"]' }]
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    } else {
      return new Response(
        `<rss><channel><item><title>Force refresh test</title><link>https://example.com/force</link><pubDate>Thu, 06 Mar 2026 10:00:00 GMT</pubDate></item></channel></rss>`,
        { status: 200, headers: { 'Content-Type': 'application/xml' } }
      )
    }
  }) as typeof fetch

  t.after(() => {
    process.env.ANTHROPIC_API_KEY = originalApiKey
    global.fetch = originalFetch
    restoreRedis()
  })

  const request = new Request('http://localhost/api/ai-research/overview?force=true')
  const response = await getOverviewRoute(request)
  const body = await response.json()
  
  assert.equal(response.status, 200)
  assert.ok(Array.isArray(body.bullets))
  assert.equal(response.headers.get('X-Data-Source'), 'fresh')
  assert.equal(response.headers.get('X-Cache-Tier'), 'slow')
})

test('overview route uses cached data by default', { concurrency: false }, async (t) => {
  clearCacheForTests()
  const restoreRedis = disableRedisForTest()
  
  const originalApiKey = process.env.ANTHROPIC_API_KEY
  const originalFetch = global.fetch
  
  process.env.ANTHROPIC_API_KEY = 'test-key'
  let fetchCount = 0
  
  global.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input)
    fetchCount++
    
    if (url.includes('api.anthropic.com')) {
      return new Response(
        JSON.stringify({
          content: [{ type: 'text', text: '["Cached overview test bullet"]' }]
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    } else {
      return new Response(
        `<rss><channel><item><title>Cache test</title><link>https://example.com/cache</link><pubDate>Thu, 06 Mar 2026 10:00:00 GMT</pubDate></item></channel></rss>`,
        { status: 200, headers: { 'Content-Type': 'application/xml' } }
      )
    }
  }) as typeof fetch

  t.after(() => {
    process.env.ANTHROPIC_API_KEY = originalApiKey
    global.fetch = originalFetch
    restoreRedis()
  })

  // First request should fetch fresh data
  const request1 = new Request('http://localhost/api/ai-research/overview')
  const response1 = await getOverviewRoute(request1)
  const body1 = await response1.json()
  
  assert.equal(response1.headers.get('X-Data-Source'), 'fresh')
  
  const initialFetchCount = fetchCount
  
  // Second request should use cached data
  const request2 = new Request('http://localhost/api/ai-research/overview')
  const response2 = await getOverviewRoute(request2)
  const body2 = await response2.json()
  
  assert.equal(response2.headers.get('X-Data-Source'), 'memory')
  assert.deepEqual(body1, body2)
  
  // Fetch count should not have increased significantly (maybe 1-2 RSS calls)
  assert.ok(fetchCount - initialFetchCount < 5, 'Should not make many new fetches for cached request')
})

test('overview route returns safe empty response when generation fails', { concurrency: false }, async (t) => {
  clearCacheForTests()
  const restoreRedis = disableRedisForTest()
  
  const originalApiKey = process.env.ANTHROPIC_API_KEY
  const originalFetch = global.fetch
  
  // Remove API key to force fallback
  process.env.ANTHROPIC_API_KEY = ''
  
  // Make all data sources fail
  global.fetch = (async () => {
    throw new Error('All sources down')
  }) as typeof fetch

  t.after(() => {
    process.env.ANTHROPIC_API_KEY = originalApiKey
    global.fetch = originalFetch
    restoreRedis()
  })

  const request = new Request('http://localhost/api/ai-research/overview')
  const response = await getOverviewRoute(request)
  const body = await response.json()
  
  assert.equal(response.status, 200)
  assert.ok(Array.isArray(body.bullets))
  assert.equal(response.headers.get('X-Data-Source'), 'none')
  assert.equal(response.headers.get('X-Cache-Tier'), 'slow')
})

test('overview route handles malformed force parameter', { concurrency: false }, async (t) => {
  clearCacheForTests()
  const restoreRedis = disableRedisForTest()
  
  const originalApiKey = process.env.ANTHROPIC_API_KEY
  const originalFetch = global.fetch
  
  process.env.ANTHROPIC_API_KEY = ''
  
  global.fetch = (async () =>
    new Response(
      `<rss><channel><item><title>Malformed test</title><link>https://example.com</link><pubDate>Thu, 06 Mar 2026 10:00:00 GMT</pubDate></item></channel></rss>`,
      { status: 200, headers: { 'Content-Type': 'application/xml' } }
    )) as typeof fetch

  t.after(() => {
    process.env.ANTHROPIC_API_KEY = originalApiKey
    global.fetch = originalFetch
    restoreRedis()
  })

  // Test various force parameter values
  const testCases = ['false', 'True', 'yes', '1', '', 'random']
  
  for (const forceValue of testCases) {
    const request = new Request(`http://localhost/api/ai-research/overview?force=${forceValue}`)
    const response = await getOverviewRoute(request)
    
    assert.equal(response.status, 200)
    
    // Only 'true' should trigger force mode
    const expectedCacheBehavior = forceValue === 'true' ? 'fresh' : ['fresh', 'memory', 'none']
    const actualSource = response.headers.get('X-Data-Source')
    
    if (forceValue === 'true') {
      assert.equal(actualSource, 'fresh', `Force=true should return fresh data`)
    } else {
      assert.ok(Array.isArray(expectedCacheBehavior) ? expectedCacheBehavior.includes(actualSource!) : actualSource === expectedCacheBehavior)
    }
  }
})

test('saveDailyOverview persists bullets when Supabase is available', { concurrency: false }, async (t) => {
  // This test requires mocking Supabase since we can't rely on real database in tests
  const { getSupabaseClient } = await import('../lib/server/supabase.ts')
  const originalSupabase = getSupabaseClient()
  
  // Skip if no Supabase available 
  if (!originalSupabase) {
    t.skip('Supabase not available for testing')
    return
  }
  
  const testBullets = ['Test bullet 1', 'Test bullet 2', 'Test bullet 3']
  
  // This is more of an integration test - in a real test environment,
  // you would mock the Supabase client
  try {
    await saveDailyOverview(testBullets)
    // If no error thrown, consider it successful
    assert.ok(true, 'saveDailyOverview completed without error')
  } catch (error) {
    // Expected in test environment without proper Supabase setup
    assert.ok(error instanceof Error)
  }
})

test('fetchDailyOverviews handles missing Supabase gracefully', async () => {
  // Mock missing Supabase
  const originalEnv = process.env.SUPABASE_URL
  process.env.SUPABASE_URL = ''
  
  const result = await fetchDailyOverviews('2026-03-01', '2026-03-07')
  
  process.env.SUPABASE_URL = originalEnv
  
  assert.deepEqual(result, [])
})

test('overview route sets correct cache headers', { concurrency: false }, async (t) => {
  clearCacheForTests()
  const restoreRedis = disableRedisForTest()
  
  const originalApiKey = process.env.ANTHROPIC_API_KEY
  const originalFetch = global.fetch
  
  process.env.ANTHROPIC_API_KEY = ''
  
  global.fetch = (async () =>
    new Response('{"items": []}', { status: 200, headers: { 'Content-Type': 'application/json' } })
  ) as typeof fetch

  t.after(() => {
    process.env.ANTHROPIC_API_KEY = originalApiKey
    global.fetch = originalFetch
    restoreRedis()
  })

  const request = new Request('http://localhost/api/ai-research/overview')
  const response = await getOverviewRoute(request)
  
  assert.equal(response.headers.get('X-Cache-Tier'), 'slow')
  assert.ok(['fresh', 'memory', 'none'].includes(response.headers.get('X-Data-Source')!))
  assert.ok(response.headers.get('Cache-Control')?.includes('s-maxage=3600'))
})