import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
const migration = (name: string) => readFile(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), 'utf8')

async function database() {
  const db = new PGlite()
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table market_snapshots(id uuid primary key default gen_random_uuid(), is_latest boolean default false, created_at timestamptz default now());
    create table screener_rows(snapshot_id uuid references market_snapshots on delete cascade, symbol text, primary key(snapshot_id,symbol));
    create table market_states(id uuid primary key, snapshot_id uuid references market_snapshots on delete cascade);
    create table market_memos(id uuid primary key, market_state_id uuid references market_states on delete cascade);
    create table market_bars_daily(symbol text, feed text, trading_date date, close numeric, low numeric, high numeric, volume bigint, primary key(symbol,feed,trading_date));
    create table overviews(id uuid primary key default gen_random_uuid());
    create table agent_jobs(id uuid primary key default gen_random_uuid(), job_type text, payload jsonb default '{}', priority int default 100, status text default 'queued' constraint agent_jobs_status_check check(status in ('queued','running','succeeded','failed','cancelled')), attempts int default 0, max_attempts int default 3, run_after timestamptz default now(), claimed_by text, claimed_at timestamptz, created_at timestamptz default now(), updated_at timestamptz default now(), last_error text);
    create table agent_runs(id uuid primary key default gen_random_uuid(), job_id uuid references agent_jobs, worker_id text, status text default 'running', output jsonb, error text, started_at timestamptz default now(), finished_at timestamptz, duration_ms integer);
  `)
  for (const name of ['202610010001_market_history_freshness','202610010002_intelligence_readiness','202610010003_agent_blocking_and_leases','202610010004_bounded_retention']) await db.exec(await migration(name))
  return db
}

test('history cursors and metrics expose missing data and actual archive freshness', async () => {
  const db = await database()
  try {
    await db.exec("insert into market_bars_daily values('TSLA','iex','2026-09-04',100,90,110,1000)")
    const cursors = await db.query<{ symbol: string; history_through: string | null; bar_count: number }>("select * from market_history_cursors(array['TSLA','MISSING'],'iex') order by symbol")
    assert.equal(cursors.rows[0].history_through, null)
    assert.equal(cursors.rows[0].bar_count, 0)
    assert.equal(new Date(cursors.rows[1].history_through!).toISOString(), '2026-09-04T00:00:00.000Z')
    const metrics = await db.query<{ history_through: string | null; close_30d: number | null }>("select * from screener_history_metrics_v2(array['TSLA'],'iex','2026-10-01')")
    assert.equal(Number(metrics.rows[0].close_30d), 100)
    assert.equal(new Date(metrics.rows[0].history_through!).toISOString(), '2026-09-04T00:00:00.000Z')
  } finally { await db.close() }
})

test('busy World work does not burn attempts and missing capabilities become blocked', async () => {
  const db = await database()
  try {
    await db.exec("insert into agent_jobs(job_type,priority) values('run-world-thinker',1),('run-world-thinker',2),('refresh-market-screener',3)")
    const first = (await db.query<{ id: string }>("select * from claim_agent_job('worker')")).rows[0]
    const second = (await db.query<{ job_type: string; attempts: number }>("select * from claim_agent_job('worker')")).rows[0]
    assert.equal(second.job_type, 'refresh-market-screener')
    assert.equal((await db.query<{ attempts: number }>("select attempts from agent_jobs where priority=2")).rows[0].attempts, 0)
    const run = (await db.query<{ id: string }>("insert into agent_runs(job_id,worker_id) values($1,'worker') returning id", [first.id])).rows[0]
    await db.query("select finish_agent_attempt($1,$2,'worker',false,$3,'Missing configuration',100,now())", [first.id, run.id, JSON.stringify({ readiness: 'blocked', reason: 'configuration', fingerprint: 'test' })])
    const blocked = (await db.query<{ status: string; blocked_on: unknown }>('select status,blocked_on from agent_jobs where id=$1', [first.id])).rows[0]
    assert.equal(blocked.status, 'blocked')
    assert.ok(blocked.blocked_on)
  } finally { await db.close() }
})

test('retention removes at most 1000 child rows and protects latest and memo evidence', async () => {
  const db = await database()
  try {
    const snapshots = await db.query<{ id: string }>("insert into market_snapshots(created_at,is_latest) values('2026-01-01',false),('2026-01-02',false),('2026-01-03',true) returning id")
    const [expired, memo, latest] = snapshots.rows.map(r => r.id)
    await db.query("insert into screener_rows select $1,'S'||n from generate_series(1,2501)n", [expired])
    await db.query("insert into market_states values(gen_random_uuid(),$1)", [memo])
    await db.exec('insert into market_memos select gen_random_uuid(),id from market_states')
    const slice = await db.query<{ slice: { deleted: number; removed: boolean } }>("select prune_market_snapshot_slice('2026-09-01') slice")
    assert.equal(slice.rows[0].slice.deleted, 1000)
    assert.equal(slice.rows[0].slice.removed, false)
    await db.exec("select prune_market_snapshot_slice('2026-09-01');select prune_market_snapshot_slice('2026-09-01')")
    assert.deepEqual((await db.query<{ id: string }>('select id from market_snapshots')).rows.map(r => r.id).sort(), [memo, latest].sort())
  } finally { await db.close() }
})
