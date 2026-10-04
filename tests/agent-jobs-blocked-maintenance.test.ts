import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { resumeBlockedAgentJobs } from '../lib/server/agent-jobs.ts'

type PlanNode = { 'Node Type': string; 'Relation Name'?: string; 'Index Name'?: string; Plans?: PlanNode[] }
const planNodes = (node: PlanNode): PlanNode[] => [node, ...(node.Plans ?? []).flatMap(planNodes)]
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json' },
})

test('the actual blocked-job reader uses the partial index without scanning completed history or changing its limit', async t => {
  process.env.SUPABASE_URL = 'https://blocked-maintenance-test.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role'
  let reader: URL | undefined
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    assert.equal(init?.method ?? 'GET', 'GET')
    reader = new URL(String(input))
    return response([])
  })
  assert.equal(await resumeBlockedAgentJobs(), 0)
  assert.ok(reader)
  assert.equal(reader.pathname, '/rest/v1/agent_jobs')
  assert.equal(reader.searchParams.get('select'), 'id,blocked_on')
  assert.equal(reader.searchParams.get('status'), 'eq.blocked')
  assert.equal(reader.searchParams.get('limit'), '100')
  assert.equal(reader.searchParams.has('order'), false)
  // Derive the SQL projection, predicate and bound from the real PostgREST
  // request, so the planner regression follows the maintenance read contract.
  const sql = `select ${reader.searchParams.get('select')} from public.agent_jobs where status=$1 limit $2`
  const parameters = [reader.searchParams.get('status')!.slice(3), Number(reader.searchParams.get('limit'))]
  const db = new PGlite()
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create table agent_jobs (
        id uuid primary key, status text not null, blocked_on jsonb, retained_payload text not null
      );
      grant select on agent_jobs to service_role;
      insert into agent_jobs
        select md5('history-'||n)::uuid,
          case when n=9999 or n=10000 then 'blocked' else 'succeeded' end,
          case when n=9999 or n=10000 then jsonb_build_object('reason','adapter','fingerprint','old-'||n) end,
          repeat('retained investigation context ',40)
        from generate_series(1,10000) n;`)
    await db.exec('vacuum analyze agent_jobs')
    const explain = async () => planNodes((await db.query<{ 'QUERY PLAN': Array<{ Plan: PlanNode }> }>(`explain (format json) ${sql}`, parameters)).rows[0]['QUERY PLAN'][0].Plan)
    const sorted = async () => (await db.query<{ id: string; blocked_on: unknown }>(sql, parameters)).rows.sort((a,b) => a.id.localeCompare(b.id))
    const before = await sorted()
    assert.equal(before.length, 2)
    assert.ok((await explain()).some(node => node['Node Type'] === 'Seq Scan' && node['Relation Name'] === 'agent_jobs'))
    await db.exec(await readFile(new URL('../supabase/migrations/202610030010_agent_jobs_blocked_index.sql', import.meta.url), 'utf8'))
    const afterPlan = await explain()
    assert.ok(afterPlan.some(node => node['Index Name'] === 'agent_jobs_blocked_maintenance'), 'the default planner must find the small blocked set through its partial index')
    assert.equal(afterPlan.some(node => node['Node Type'] === 'Seq Scan' && node['Relation Name'] === 'agent_jobs'), false)
    assert.deepEqual(await sorted(), before, 'the indexed read must retain both original blocked reasons and fingerprints')
    // Moving jobs across the predicate must update membership without altering
    // historical records or granting public access to private maintenance state.
    await db.query("update agent_jobs set status='queued',blocked_on=null where id=$1", [before[0].id])
    await db.exec("update agent_jobs set status='blocked',blocked_on=jsonb_build_object('reason','configuration','fingerprint','changed') where id=md5('history-1')::uuid")
    const moved = await sorted()
    assert.equal(moved.length, 2)
    assert.ok(moved.some(row => row.id === before[1].id))
    assert.equal(moved.some(row => row.id === before[0].id), false)
    assert.deepEqual((await db.query("select has_table_privilege('anon','agent_jobs','SELECT') anon,has_table_privilege('authenticated','agent_jobs','SELECT') authenticated,has_table_privilege('service_role','agent_jobs','SELECT') service")).rows, [{ anon: false, authenticated: false, service: true }])
    await db.exec(`insert into agent_jobs
      select md5('new-blocked-'||n)::uuid,'blocked',jsonb_build_object('reason','retired','fingerprint','retired'),''
      from generate_series(1,105) n`)
    assert.equal((await sorted()).length, 100, 'the existing maintenance cap remains 100')
  } finally { await db.close() }
})

test('blocked maintenance labels failures, preserves unchanged fingerprints and resets only changed jobs', async t => {
  process.env.SUPABASE_URL = 'https://blocked-maintenance-test.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role'
  const calls: Array<{ method: string; url: URL; body: Record<string, unknown> | null }> = []
  let phase: 'read_error' | 'update_error' | 'success' = 'read_error'
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? 'GET', url = new URL(String(input))
    calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : null })
    if (method === 'GET') {
      if (phase === 'read_error') return response({ code: 'P0001', message: 'maintenance read unavailable' }, 400)
      return response(phase === 'update_error'
        ? [{ id: '00000000-0000-4000-8000-000000000001', blocked_on: { reason: 'retired', fingerprint: 'old' } }]
        : [
          { id: '00000000-0000-4000-8000-000000000001', blocked_on: { reason: 'retired', fingerprint: 'git-world-v1' } },
          { id: '00000000-0000-4000-8000-000000000002', blocked_on: { reason: 'retired', fingerprint: 'old' } },
          { id: '00000000-0000-4000-8000-000000000003', blocked_on: null },
        ])
    }
    return phase === 'success' ? response([]) : response({ code: 'P0001', message: 'maintenance update unavailable' }, 400)
  })
  await assert.rejects(resumeBlockedAgentJobs(), /Unable to inspect blocked agent jobs: maintenance read unavailable/)
  assert.deepEqual(calls.map(call => call.method), ['GET'])
  phase = 'update_error'; calls.length = 0
  await assert.rejects(resumeBlockedAgentJobs(), /Unable to resume blocked agent job: maintenance update unavailable/)
  assert.deepEqual(calls.map(call => call.method), ['GET', 'PATCH'])
  assert.equal(calls[1].url.searchParams.get('id'), 'eq.00000000-0000-4000-8000-000000000001')
  assert.equal(calls[1].url.searchParams.get('status'), 'eq.blocked')
  assert.deepEqual({ ...calls[1].body, run_after: 'timestamp' }, { status: 'queued', blocked_on: null, attempts: 0, run_after: 'timestamp' })
  assert.ok(Number.isFinite(Date.parse(String(calls[1].body?.run_after))))
  phase = 'success'; calls.length = 0
  assert.equal(await resumeBlockedAgentJobs(), 1)
  assert.deepEqual(calls.map(call => call.method), ['GET', 'PATCH'])
  assert.equal(calls[1].url.searchParams.get('id'), 'eq.00000000-0000-4000-8000-000000000002')
  assert.equal(calls[1].url.searchParams.get('status'), 'eq.blocked')
  assert.deepEqual({ ...calls[1].body, run_after: 'timestamp' }, { status: 'queued', blocked_on: null, attempts: 0, run_after: 'timestamp' })
})
