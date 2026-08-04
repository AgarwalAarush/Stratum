import assert from 'node:assert/strict'
import test from 'node:test'
import { aiPowerV1SourceAdapter, criticalMaterialsV1SourceAdapter, semicapDataCenterV1SourceAdapter } from '../lib/server/world-sources.ts'

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

test('semicap/data-center packet maps primary evidence to the generic domain mechanisms', async () => {
  const result = await semicapDataCenterV1SourceAdapter.ingest({
    fetchImpl: async () => new Response(html('semicap source'), { status: 200, headers: { 'content-type': 'text/html' } }),
  })
  assert.equal(result.observations.length, 4)
  assert.deepEqual(new Set(result.observations.map((item) => item.mechanism)), new Set(['compute_demand', 'component_lead_time', 'fabrication_capacity', 'supply_chain_capture']))
  assert.ok(result.observations.every((item) => item.domain === 'semicap-data-center-equipment' && Boolean(item.sourceSlug)))
})

test('critical-materials packet maps supply, processing, trade, and substitution evidence without a price call', async () => {
  const result = await criticalMaterialsV1SourceAdapter.ingest({
    fetchImpl: async () => new Response(html('critical materials source'), { status: 200, headers: { 'content-type': 'text/html' } }),
  })
  assert.equal(result.observations.length, 4)
  assert.deepEqual(new Set(result.observations.map((item) => item.mechanism)), new Set(['resource_supply', 'processing_concentration', 'trade_constraint', 'substitution']))
  assert.ok(result.observations.every((item) => item.domain === 'critical-materials' && Boolean(item.sourceSlug)))
  assert.ok(result.observations.every((item) => !/price target|buy|sell/i.test(item.assertion)))
})
