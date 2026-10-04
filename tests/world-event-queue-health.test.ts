import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { fetchWorldWorkspace } from '../lib/server/world-projection.ts'

type PlanNode = { 'Node Type': string; 'Index Name'?: string; Plans?: PlanNode[] }
const planNodes = (node: PlanNode): PlanNode[] => [node, ...(node.Plans ?? []).flatMap(planNodes)]

test('queue health remains exact beyond the API cap and uses an index-only plan for wide retained events', async () => {
  const db = new PGlite()
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create table world_event_clusters (processing_state text,first_seen_at timestamptz,source_diversity integer);
      insert into world_event_clusters select 'quarantined','2026-09-01T00:00:00Z',2 from generate_series(1,1500);
      insert into world_event_clusters select 'pending','2026-10-01T00:00:00Z',3 from generate_series(1,1200);
      insert into world_event_clusters select 'failed','2026-09-30T00:00:00Z',1 from generate_series(1,7);
      insert into world_event_clusters select 'processed','2026-08-01T00:00:00Z',100 from generate_series(1,90);
      insert into world_event_clusters select 'processing','2026-08-01T00:00:00Z',100 from generate_series(1,10);`)
    await db.exec(await readFile(new URL('../supabase/migrations/202610030007_world_event_queue_health.sql', import.meta.url), 'utf8'))
    // Retained event context makes the heap wide even though health needs only
    // three fields. Keep each value inline so the planner sees the heap cost.
    await db.exec("alter table world_event_clusters add column retained_event_context text; update world_event_clusters set retained_event_context=repeat('observed event context ',60)")
    await db.exec('vacuum analyze world_event_clusters')
    const healthSql = (await db.query<{ prosrc: string }>("select prosrc from pg_proc where oid='world_event_queue_health()'::regprocedure")).rows[0].prosrc
    const explain = async () => planNodes((await db.query<{ 'QUERY PLAN': Array<{ Plan: PlanNode }> }>(`explain (format json) ${healthSql}`)).rows[0]['QUERY PLAN'][0].Plan)
    assert.ok((await explain()).some(node => node['Node Type'] === 'Seq Scan'))
    const health = async () => (await db.query<{ pending_events: number; failed_events: number; quarantined_events: number; oldest: string; source_count: number }>('select pending_events,failed_events,quarantined_events,oldest_pending_at::text oldest,source_count from world_event_queue_health()')).rows[0]
    const row = await health()
    assert.equal(Number(row.pending_events), 1200)
    assert.equal(Number(row.failed_events), 7)
    assert.equal(Number(row.quarantined_events), 1500)
    assert.equal(Number(row.source_count), 6607)
    assert.equal(Date.parse(row.oldest), Date.parse('2026-09-30T00:00:00Z'))
    await db.exec(await readFile(new URL('../supabase/migrations/202610030008_world_event_queue_health_index.sql', import.meta.url), 'utf8'))
    assert.ok((await explain()).some(node => node['Node Type'] === 'Index Only Scan' && node['Index Name'] === 'world_event_clusters_queue_health'), 'the default planner must use the covering queue index')
    assert.deepEqual(await health(), row, 'indexing must preserve exact queue counts, source totals and oldest timestamp')
    const privileges = await db.query<{ anon: boolean; authenticated: boolean; service: boolean }>("select has_function_privilege('anon','world_event_queue_health()','EXECUTE') anon,has_function_privilege('authenticated','world_event_queue_health()','EXECUTE') authenticated,has_function_privilege('service_role','world_event_queue_health()','EXECUTE') service")
    assert.deepEqual(privileges.rows[0], { anon: false, authenticated: false, service: true })
    await db.exec('set role anon')
    await assert.rejects(health(), /permission denied/)
    await db.exec('reset role; set role authenticated')
    await assert.rejects(health(), /permission denied/)
    await db.exec('reset role; set role service_role')
    assert.equal(Number((await health()).quarantined_events), 1500)
    await db.exec('reset role; truncate world_event_clusters')
    assert.deepEqual(await health(), { pending_events: 0, failed_events: 0, quarantined_events: 0, oldest: null, source_count: 0 })
  } finally {
    await db.close()
  }
})

test('World workspace uses exact queue aggregates and never derives health from capped event rows', async t => {
  process.env.SUPABASE_URL = 'https://queue-health-test.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role'
  const queries: URL[] = []
  let missingHealth = false
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL) => {
    const url = new URL(String(input)); queries.push(url)
    assert.equal(url.pathname.endsWith('/world_event_clusters'), false, 'health must not fetch a capped event sample')
    let response: unknown = []
    if (url.pathname.endsWith('/rpc/world_event_queue_health')) response = missingHealth ? [] : [{ pending_events: 1200, failed_events: 7, quarantined_events: 1500, oldest_pending_at: '2026-09-30T00:00:00Z', source_count: 6607 }]
    if (url.pathname.endsWith('/world_repository_projections') || url.pathname.endsWith('/world_replay_runs')) response = null
    if (url.pathname.endsWith('/world_thinker_runs')) response = url.searchParams.has('status')
      ? { result_commit: 'accepted', started_at: '2026-10-02T12:00:00Z' }
      : { status: 'noop', result_commit: null, started_at: '2026-10-03T12:00:00Z', error: null }
    return new Response(JSON.stringify(response), { headers: { 'Content-Type': 'application/json' } })
  })
  const workspace = await fetchWorldWorkspace()
  assert.deepEqual(workspace.health, {
    lastRunAt: '2026-10-03T12:00:00Z', lastRunStatus: 'noop', lastCommit: null,
    pendingEvents: 1200, failedEvents: 7, quarantinedEvents: 1500, oldestPendingAt: '2026-09-30T00:00:00Z', sourceCount: 6607, failure: null,
    lastSuccessfulRunAt: '2026-10-02T12:00:00Z', lastSuccessfulCommit: 'accepted',
  })
  assert.equal(queries.filter(q => q.pathname.endsWith('/rpc/world_event_queue_health')).length, 1)
  missingHealth = true
  await assert.rejects(fetchWorldWorkspace(), /event queue health is unavailable/)
})
