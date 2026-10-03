import test from 'node:test'
import assert from 'node:assert/strict'
import { latestCompleteMarketSnapshot } from '../lib/server/recommendations.ts'

test('failed market refreshes cannot crowd the last complete snapshot out of decision inputs', async t => {
  process.env.SUPABASE_URL = 'https://market-snapshot-test.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-key'
  const cutoff = '2026-10-03T10:50:00Z'
  const complete = {id:'accepted', status:'complete', created_at:'2026-10-01T19:56:00Z', data_as_of:'2026-10-01T19:55:00Z', feed:'iex'}
  const requests: URL[] = []
  let fail = false
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL) => {
    const url = new URL(String(input)); requests.push(url)
    if (fail) return Response.json({message:'snapshot store unavailable'}, {status:503})
    return Response.json(url.searchParams.get('status') === 'eq.complete' ? [complete] : Array.from({length:10}, (_,i)=>({id:`failed-${i}`,status:'failed'})))
  })
  assert.deepEqual(await latestCompleteMarketSnapshot(cutoff), [complete])
  assert.equal(requests[0].searchParams.get('created_at'), `lte.${cutoff}`)
  assert.equal(requests[0].searchParams.get('limit'), '1')
  assert.equal(requests[0].searchParams.get('order'), 'created_at.desc,id.asc')
  assert.equal((await latestCompleteMarketSnapshot(cutoff))[0].data_as_of, complete.data_as_of)
  fail = true
  await assert.rejects(latestCompleteMarketSnapshot(cutoff), /snapshot store unavailable/)
})
