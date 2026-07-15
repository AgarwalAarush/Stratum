import test from 'node:test'
import assert from 'node:assert/strict'

import { clearCacheForTests } from '../lib/server/cache.ts'
import { generateGlobalNewsOverview } from '../lib/data/global-news-overview.ts'

function openAIResponse(bullets: string[]): Response {
  return new Response(JSON.stringify({
    id: 'resp_global',
    object: 'response',
    created_at: 0,
    status: 'completed',
    model: 'gpt-5.6-luna',
    output: [{
      id: 'msg_global',
      type: 'message',
      status: 'completed',
      role: 'assistant',
      content: [{ type: 'output_text', text: JSON.stringify({ bullets }), annotations: [] }],
    }],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

test('global news overview returns fallback bullets without an OpenAI key', { concurrency: false }, async (t) => {
  const originalKey = process.env.OPENAI_API_KEY
  process.env.OPENAI_API_KEY = ''
  t.after(() => { process.env.OPENAI_API_KEY = originalKey })

  const result = await generateGlobalNewsOverview()
  assert.ok(result.bullets.length >= 6)
  assert.match(result.bullets.join(' '), /Geopolitical|European Union/)
})

test('global news overview uses structured OpenAI output and expands citations', { concurrency: false }, async (t) => {
  clearCacheForTests()
  const originalKey = process.env.OPENAI_API_KEY
  const originalFetch = global.fetch
  process.env.OPENAI_API_KEY = 'test-key'
  global.fetch = (async (input: RequestInfo | URL) => {
    if (String(input).includes('api.openai.com')) {
      return openAIResponse(['Diplomatic coordination is shifting around a new summit [1].'])
    }
    return new Response('<rss><channel><item><title>Leaders meet for summit</title><link>https://example.com/summit</link><pubDate>Wed, 15 Jul 2026 12:00:00 GMT</pubDate></item></channel></rss>', {
      status: 200,
      headers: { 'Content-Type': 'application/xml' },
    })
  }) as typeof fetch
  t.after(() => {
    process.env.OPENAI_API_KEY = originalKey
    global.fetch = originalFetch
  })

  const result = await generateGlobalNewsOverview()
  assert.equal(result.bullets.length, 1)
  assert.match(result.bullets[0], /\[1\]\(https:\/\/example\.com\/summit\)/)
})
