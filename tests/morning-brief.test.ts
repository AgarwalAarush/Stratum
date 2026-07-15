import test from 'node:test'
import assert from 'node:assert/strict'

import { clearCacheForTests } from '../lib/server/cache.ts'
import { generateMorningBrief } from '../lib/data/morning-brief.ts'

function openAIResponse(): Response {
  const brief = {
    headline: 'AI infrastructure demand is setting the day\'s technology agenda [1].',
    sections: [
      { title: 'AI & Research', bullets: ['A new model launch raises the competitive baseline [1].'] },
      { title: 'Markets', bullets: ['Infrastructure spending remains the clearest cross-sector signal [1].'] },
      { title: 'Policy', bullets: ['Regulatory attention is likely to follow deployment scale [1].'] },
    ],
    watchList: ['Watch follow-up benchmark disclosures [1].'],
  }
  return new Response(JSON.stringify({
    id: 'resp_morning',
    object: 'response',
    created_at: 0,
    status: 'completed',
    model: 'gpt-5.6-terra',
    output: [{
      id: 'msg_morning',
      type: 'message',
      status: 'completed',
      role: 'assistant',
      content: [{ type: 'output_text', text: JSON.stringify(brief), annotations: [] }],
    }],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

test('morning brief returns the fallback without OpenAI credentials', { concurrency: false }, async (t) => {
  const originalKey = process.env.OPENAI_API_KEY
  process.env.OPENAI_API_KEY = ''
  t.after(() => { process.env.OPENAI_API_KEY = originalKey })

  const brief = await generateMorningBrief()
  assert.match(brief.headline, /temporarily unavailable/)
  assert.equal(brief.itemCount, 0)
})

test('morning brief preserves its contract with structured OpenAI output', { concurrency: false }, async (t) => {
  clearCacheForTests()
  const originalKey = process.env.OPENAI_API_KEY
  const originalFetch = global.fetch
  const originalSupabaseUrl = process.env.SUPABASE_URL
  process.env.OPENAI_API_KEY = 'test-key'
  process.env.SUPABASE_URL = ''
  global.fetch = (async (input: RequestInfo | URL) => {
    if (String(input).includes('api.openai.com')) return openAIResponse()
    return new Response('<rss><channel><item><title>New AI system launches</title><link>https://example.com/launch</link><pubDate>Wed, 15 Jul 2026 12:00:00 GMT</pubDate></item></channel></rss>', {
      status: 200,
      headers: { 'Content-Type': 'application/xml' },
    })
  }) as typeof fetch
  t.after(() => {
    process.env.OPENAI_API_KEY = originalKey
    process.env.SUPABASE_URL = originalSupabaseUrl
    global.fetch = originalFetch
  })

  const brief = await generateMorningBrief()
  assert.equal(brief.sections.length, 3)
  assert.ok(brief.itemCount > 0)
  assert.match(brief.headline, /\[1\]\(https:\/\/example\.com\/launch\)/)
  assert.equal(brief.generatedAt, brief.fetchedAt)
})
