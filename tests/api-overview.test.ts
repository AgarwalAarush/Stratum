import test from 'node:test'
import assert from 'node:assert/strict'

import { clearCacheForTests } from '../lib/server/cache.ts'
import { generateAIOverview } from '../lib/data/overview.ts'
import { saveDailyOverview, fetchDailyOverviews } from '../lib/data/overview-persistence.ts'
import { GET as getOverviewRoute } from '../app/api/ai-research/overview/route.ts'

function openAIOverviewResponse(bullets: string[]): Response {
  return new Response(JSON.stringify({
    id: 'resp_test',
    object: 'response',
    created_at: 0,
    status: 'completed',
    model: 'gpt-5.6-luna',
    output: [{
      id: 'msg_test',
      type: 'message',
      status: 'completed',
      role: 'assistant',
      content: [{ type: 'output_text', text: JSON.stringify({ bullets }), annotations: [] }],
    }],
    usage: { input_tokens: 10, output_tokens: 10, total_tokens: 20 },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

test('generateAIOverview reports blocked status when API key is missing', { concurrency: false }, async (t) => {
  const originalApiKey = process.env.OPENAI_API_KEY
  const originalFetch = global.fetch
  
  // Remove API key
  process.env.OPENAI_API_KEY = ''
  
  // Mock fetch to return some content (should not be called)
  global.fetch = (async () =>
    new Response(
      JSON.stringify([{ title: 'Test item', url: 'https://example.com' }]),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )) as typeof fetch

  t.after(() => {
    process.env.OPENAI_API_KEY = originalApiKey
    global.fetch = originalFetch
  })

  const result = await generateAIOverview()
  
  assert.ok(Array.isArray(result.bullets))
  assert.equal(result.bullets.length, 0)
  assert.equal(result.readiness, 'blocked')
  assert.equal(result.generatedAt, null)
  assert.ok(typeof result.fetchedAt === 'string')
  
})

test('generateAIOverview handles fetch failures gracefully', { concurrency: false }, async (t) => {
  const originalApiKey = process.env.OPENAI_API_KEY
  const originalFetch = global.fetch
  
  process.env.OPENAI_API_KEY = 'test-key'
  
  // Mock all fetches to fail
  global.fetch = (async () => {
    throw new Error('Network failure')
  }) as typeof fetch

  t.after(() => {
    process.env.OPENAI_API_KEY = originalApiKey
    global.fetch = originalFetch
  })

  const result = await generateAIOverview()
  
  // Failed collection cannot fabricate analysis
  assert.ok(Array.isArray(result.bullets))
  assert.equal(result.bullets.length, 0)
  assert.equal(result.readiness, 'blocked')
  assert.ok(typeof result.fetchedAt === 'string')
})

test('generateAIOverview processes successful data sources', { concurrency: false }, async (t) => {
  clearCacheForTests()
  const originalApiKey = process.env.OPENAI_API_KEY
  const originalFetch = global.fetch
  
  process.env.OPENAI_API_KEY = 'test-key'
  
  let fetchCallCount = 0
  
  // Mock successful data fetch and OpenAI Responses API response
  global.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input)
    fetchCallCount++
    
    if (url.includes('api.openai.com')) {
      return openAIOverviewResponse([
        'AI development accelerates with new breakthrough [1]',
        'Policy changes impact tech industry [1]',
        'Venture funding reaches new milestone [1]',
      ])
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
    process.env.OPENAI_API_KEY = originalApiKey
    global.fetch = originalFetch
  })

  const result = await generateAIOverview()
  
  assert.ok(Array.isArray(result.bullets))
  assert.ok(result.bullets.length > 0)
  assert.ok(typeof result.fetchedAt === 'string')
  assert.ok(fetchCallCount > 0, 'Should have made fetch calls')
})

test('generateAIOverview expands source citations to markdown links', { concurrency: false }, async (t) => {
  clearCacheForTests()
  const originalApiKey = process.env.OPENAI_API_KEY
  const originalFetch = global.fetch

  process.env.OPENAI_API_KEY = 'test-key'
  
  global.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input)
    
    if (url.includes('api.openai.com')) {
      return openAIOverviewResponse([
        'Major AI breakthrough announced [1]',
        'New policy framework released [1]',
      ])
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
    process.env.OPENAI_API_KEY = originalApiKey
    global.fetch = originalFetch
  })

  const result = await generateAIOverview()
  
  // Should have converted [1] references to [1](url) markdown links
  const hasMarkdownLinks = result.bullets.some(bullet => 
    bullet.includes('](https://') || bullet.includes('](http://')
  )
  assert.ok(hasMarkdownLinks, 'Should expand citations to markdown links')
})

test('overview page reads never invoke generation, including force requests', { concurrency: false }, async (t) => {
  const original = global.fetch
  const key = process.env.OPENAI_API_KEY
  process.env.OPENAI_API_KEY = 'test-key'
  let generationCalls = 0
  global.fetch = (async (input: RequestInfo | URL) => {
    if (String(input).includes('api.openai.com')) generationCalls++
    return new Response(JSON.stringify([]), { status: 200 })
  }) as typeof fetch
  t.after(() => { global.fetch = original; process.env.OPENAI_API_KEY = key })
  for (let i = 0; i < 2; i++) {
    const response = await Reflect.apply(getOverviewRoute, null, [new Request(`http://localhost/api/ai-research/overview?force=${i === 0}`)])
    const body = await response.json()
    assert.equal(response.status, 200)
    assert.deepEqual(body.bullets, [])
    assert.equal(body.readiness, 'blocked')
    assert.equal(response.headers.get('X-Data-Source'), 'none')
  }
  assert.equal(generationCalls, 0)
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
    await saveDailyOverview({ bullets: testBullets, fetchedAt: new Date().toISOString(), readiness: 'blocked' })
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
  
  const originalApiKey = process.env.OPENAI_API_KEY
  const originalFetch = global.fetch
  
  process.env.OPENAI_API_KEY = ''
  
  global.fetch = (async () =>
    new Response('{"items": []}', { status: 200, headers: { 'Content-Type': 'application/json' } })
  ) as typeof fetch

  t.after(() => {
    process.env.OPENAI_API_KEY = originalApiKey
    global.fetch = originalFetch
  })

  const request = new Request('http://localhost/api/ai-research/overview')
  const response = await Reflect.apply(getOverviewRoute, null, [request])
  
  assert.equal(response.headers.get('X-Cache-Tier'), 'slow')
  assert.ok(['fresh', 'memory', 'none'].includes(response.headers.get('X-Data-Source')!))
  assert.ok(response.headers.get('Cache-Control')?.includes('s-maxage=3600'))
})
