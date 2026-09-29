import test from 'node:test'
import assert from 'node:assert/strict'
import { fetchResearchJobs, parseResearchJobIds } from '../lib/server/research-jobs.ts'

const ids = ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002']

test('research polling validates and bounds a batch without allowing arbitrary filters', () => {
  assert.equal(parseResearchJobIds(null), undefined)
  assert.deepEqual(parseResearchJobIds([...ids, ids[0]].join(',')), ids)
  for (const input of ['', 'not-a-job', 'id.eq.anything', Array(13).fill(ids[0]).join(',')]) {
    assert.throws(() => parseResearchJobIds(input), /12 valid/)
  }
})

test('a batch of jobs uses two owner-scoped reads instead of one request per job', async context => {
  process.env.SUPABASE_URL = 'https://research-jobs.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'fixture-key'
  const requests: URL[] = []
  context.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL) => {
    const url = new URL(String(input))
    requests.push(url)
    if (url.pathname.endsWith('/agent_jobs')) return Response.json(ids.map((id, index) => ({
      id, status: 'running', payload: { ownerId: 'owner', symbol: index ? 'SECOND' : 'FIRST' },
      last_error: null, created_at: '2026-09-01', updated_at: '2026-09-01',
    })))
    return Response.json(ids.map(job_id => ({ job_id, output: { phase: 'Reading evidence', progress: 55 }, error: null, started_at: '2026-09-01' })))
  })
  const jobs = await fetchResearchJobs('owner', { ids })
  assert.equal(requests.length, 2)
  assert.equal(requests[0].searchParams.get('payload'), 'cs.{"ownerId":"owner"}')
  assert.equal(requests[0].searchParams.get('id'), `in.(${ids.join(',')})`)
  assert.equal(requests[1].searchParams.get('job_id'), `in.(${ids.join(',')})`)
  assert.deepEqual(jobs.map(job => job.progress), [55, 55])
})
