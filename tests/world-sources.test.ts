import assert from 'node:assert/strict'
import test from 'node:test'
import { aiPowerV1SourceAdapter } from '../lib/server/world-sources.ts'

function html(title: string) {
  return `<!doctype html><html><head><title>${title}</title><script>ignore()</script></head><body><main>${'Evidence about AI data centers, electricity demand, reliability, interconnection, capacity and equipment. '.repeat(8)}</main></body></html>`
}

test('AI/power adapter archives a primary-source packet as extracted observations', async () => {
  const requests: string[] = []
  const result = await aiPowerV1SourceAdapter.ingest({
    fetchImpl: async (input) => {
      const url = String(input)
      requests.push(url)
      return new Response(html(url), { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } })
    },
  })
  assert.equal(result.observations.length, 5)
  assert.deepEqual(result.failures, [])
  assert.equal(requests.length, 5)
  assert.ok(result.observations.some((item) => item.mechanism === 'data_center_load' && item.sourceTier === 'regulatory'))
  assert.ok(result.observations.some((item) => item.mechanism === 'interconnection_constraint' && item.sourceTier === 'regulatory'))
  assert.ok(result.observations.some((item) => item.sourceTier === 'independent'))
  assert.ok(result.observations.every((item) => Buffer.isBuffer(item.rawBody) && item.rawBody.toString('utf8').includes('<html') && !item.body.includes('ignore()')))
})

test('AI/power adapter preserves partial progress when one source is unavailable', async () => {
  let calls = 0
  const result = await aiPowerV1SourceAdapter.ingest({
    fetchImpl: async (input) => {
      calls += 1
      if (calls === 1) return new Response('unavailable', { status: 503 })
      return new Response(html(String(input)), { status: 200, headers: { 'content-type': 'text/html' } })
    },
  })
  assert.equal(result.observations.length, 4)
  assert.match(result.failures[0]!.message, /HTTP 503/)
})
