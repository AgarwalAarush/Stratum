import test from 'node:test'
import assert from 'node:assert/strict'

import { generateWeeklyOverview } from '../lib/data/overview-generators.ts'

function openAITextResponse(content: string): Response {
  return new Response(JSON.stringify({
    id: 'resp_periodic',
    object: 'response',
    created_at: 0,
    status: 'completed',
    model: 'gpt-5.6-terra',
    output: [{
      id: 'msg_periodic',
      type: 'message',
      status: 'completed',
      role: 'assistant',
      content: [{ type: 'output_text', text: JSON.stringify({ content }), annotations: [] }],
    }],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

test('weekly overview returns a provider error without an OpenAI key', { concurrency: false }, async (t) => {
  const originalKey = process.env.OPENAI_API_KEY
  process.env.OPENAI_API_KEY = ''
  t.after(() => { process.env.OPENAI_API_KEY = originalKey })

  assert.deepEqual(await generateWeeklyOverview(), { success: false, error: 'No OpenAI API key' })
})

test('weekly overview generates and persists OpenAI structured content', { concurrency: false }, async (t) => {
  const originalKey = process.env.OPENAI_API_KEY
  const originalFetch = global.fetch
  process.env.OPENAI_API_KEY = 'test-key'
  global.fetch = (async () => openAITextResponse('# Weekly signal\n\nInfrastructure demand strengthened.')) as typeof fetch
  t.after(() => {
    process.env.OPENAI_API_KEY = originalKey
    global.fetch = originalFetch
  })

  const persisted: unknown[][] = []
  const result = await generateWeeklyOverview({
    now: new Date('2026-07-15T12:00:00Z'),
    loadData: async () => ({
      dailies: [{ date: '2026-07-06', bullets: ['AI infrastructure accelerated.'] }],
      globalNewsDailies: [{ date: '2026-07-06', bullets: ['Trade policy tightened.'] }],
    }),
    persist: async (...args) => { persisted.push(args) },
  })

  assert.equal(result.success, true)
  assert.equal(result.date, '2026-07-06')
  assert.match(result.content ?? '', /Weekly signal/)
  assert.deepEqual(persisted[0], ['weekly', '# Weekly signal\n\nInfrastructure demand strengthened.', '2026-07-06', '2026-07-06', '2026-07-12'])
})
