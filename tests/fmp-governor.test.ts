import test from 'node:test'
import assert from 'node:assert/strict'

import { fetchFmpStableJson, FmpRequestGovernor } from '../lib/server/fmp.ts'

test('FMP governor limits concurrent provider requests and records response bytes', async () => {
  const governor = new FmpRequestGovernor({ maximumConcurrent: 2, maximumRequests: 100 })
  let active = 0
  let maximumActive = 0
  const operations = Array.from({ length: 5 }, (_, index) => governor.run(async () => {
    active += 1
    maximumActive = Math.max(maximumActive, active)
    await new Promise((resolve) => setTimeout(resolve, 5))
    active -= 1
    governor.recordResponse(200, index + 1)
    return index
  }))
  assert.deepEqual(await Promise.all(operations), [0, 1, 2, 3, 4])
  assert.equal(maximumActive, 2)
  assert.equal(governor.snapshot().totalRequests, 5)
  assert.equal(governor.snapshot().responseBytes, 15)
})

test('FMP governor holds requests beyond its rolling-window budget', async () => {
  const governor = new FmpRequestGovernor({
    maximumConcurrent: 2,
    maximumRequests: 1,
    windowMs: 20,
  })
  const starts: number[] = []
  await Promise.all([
    governor.run(async () => { starts.push(Date.now()) }),
    governor.run(async () => { starts.push(Date.now()) }),
  ])
  assert.equal(starts.length, 2)
  assert.ok(starts[1]! - starts[0]! >= 15)
  assert.equal(governor.snapshot().throttledRequests, 1)
})

test('FMP requests retry transient provider failures without retrying plan gates', async () => {
  let calls = 0
  const waits: number[] = []
  const value = await fetchFmpStableJson<{ ok: boolean }>('profile', { symbol: 'TEST' }, {
    apiKey: 'test-key',
    fetchImpl: async () => {
      calls += 1
      return calls === 1
        ? new Response('rate limited', { status: 429 })
        : Response.json({ ok: true })
    },
    wait: async (milliseconds) => { waits.push(milliseconds) },
  })
  assert.deepEqual(value, { ok: true })
  assert.equal(calls, 2)
  assert.deepEqual(waits, [200])

  let gatedCalls = 0
  await assert.rejects(() => fetchFmpStableJson('press-releases-latest', {}, {
    apiKey: 'test-key',
    fetchImpl: async () => {
      gatedCalls += 1
      return new Response('Payment Required', { status: 402 })
    },
    wait: async () => {},
  }), /402/)
  assert.equal(gatedCalls, 1)
})
