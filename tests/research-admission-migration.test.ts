import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const release = 'a'.repeat(40)
async function database() {
  const db = new PGlite()
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table worker_heartbeats(worker_id text primary key,scheduler_enabled boolean not null,fmp_enabled boolean not null,codex_enabled boolean not null,last_seen_at timestamptz not null default now());
    create table agent_jobs(id uuid primary key default gen_random_uuid(),job_type text,payload jsonb default '{}',dedupe_key text unique,priority int default 100,status text default 'queued',attempts int default 0,max_attempts int default 3,run_after timestamptz default now(),claimed_by text,claimed_at timestamptz,created_at timestamptz default now(),updated_at timestamptz default now(),last_error text);
    insert into worker_heartbeats values('legacy',true,true,true,now()-interval '10 minutes');`)
  await db.exec(await readFile(new URL('../supabase/migrations/202610030001_worker_research_readiness.sql', import.meta.url), 'utf8'))
  await db.query(`insert into worker_heartbeats(worker_id,scheduler_enabled,fmp_enabled,codex_enabled,last_seen_at,last_loop_at,release_sha,research_contract_version,health_status)
    values('current',true,true,true,now(),now(),$1,1,'healthy')`, [release])
  return db
}
interface Admission { id: string | null; admitted: boolean; deduplicated: boolean; status: string }
const payload = (symbol: string) => ({ ownerId: 'owner', symbol, requiredWorkerRelease: release, requiredResearchContractVersion: 1, reason: 'portfolio-contract-upgrade' })
async function admit(db: PGlite, symbol: string, key: string, limit = 4, type = 'generate-company-research') {
  return (await db.query<Admission>('select * from enqueue_bounded_research_job($1,$2,$3,$4,12)', [type, JSON.stringify(payload(symbol)), key, limit])).rows[0]
}

test('atomic research admission enforces shared pending capacity and active-symbol deduplication', async () => {
  const db = await database()
  try {
    const first = await admit(db, 'TSLA', 'first', 2)
    assert.equal(first.admitted, true)
    const same = await admit(db, 'tsla', 'different-lane', 2, 'event-refresh-company-research')
    assert.equal(same.id, first.id)
    assert.equal(same.deduplicated, true)
    assert.equal((await admit(db, 'GRID', 'second', 2, 'generate-etf-research')).admitted, true)
    const capped = await admit(db, 'LITE', 'third', 2)
    assert.equal(capped.admitted, false)
    assert.equal(capped.status, 'capacity')
    assert.equal(capped.id, null)
    assert.equal((await db.query<{ n: number }>('select count(*)::int n from agent_jobs')).rows[0].n, 2)
  } finally { await db.close() }
})

test('unknown or mismatched live worker contract blocks admission without queue writes', async () => {
  const db = await database()
  try {
    await db.exec("update worker_heartbeats set last_seen_at=now() where worker_id='legacy'")
    assert.equal((await admit(db, 'TSLA', 'unknown-worker')).status, 'worker_not_ready')
    await db.exec("update worker_heartbeats set last_seen_at=now()-interval '10 minutes' where worker_id='legacy';update worker_heartbeats set research_contract_version=0 where worker_id='current'")
    assert.equal((await admit(db, 'TSLA', 'old-contract')).admitted, false)
    assert.equal((await db.query<{ n: number }>('select count(*)::int n from agent_jobs')).rows[0].n, 0)
  } finally { await db.close() }
})

test('worker rollback cannot claim a release-guarded backfill or burn its attempts', async () => {
  const db = await database()
  try {
    const admitted = await admit(db, 'TSLA', 'guarded')
    await db.exec("update worker_heartbeats set release_sha='older-release' where worker_id='current';insert into agent_jobs(job_type,priority) values('refresh-market-screener',100)")
    const fallback = (await db.query<{ job_type: string }>("select * from claim_agent_job('current')")).rows[0]
    assert.equal(fallback.job_type, 'refresh-market-screener')
    const guarded = (await db.query<{ status: string; attempts: number }>('select status,attempts from agent_jobs where id=$1', [admitted.id])).rows[0]
    assert.deepEqual(guarded, { status: 'queued', attempts: 0 })
    await db.query("update worker_heartbeats set release_sha=$1 where worker_id='current'", [release])
    assert.equal((await db.query<{ id: string }>("select * from claim_agent_job('current')")).rows[0].id, admitted.id)
  } finally { await db.close() }
})

test('explicit research repair queue is durable while execution stays bounded across workers', async () => {
  const db = await database()
  try {
    await db.exec("insert into agent_jobs(job_type,priority) select 'generate-company-research',1 from generate_series(1,6);insert into agent_jobs(job_type,priority) values('refresh-market-screener',100)")
    for (let i = 0; i < 4; i++) assert.equal((await db.query<{ job_type: string }>('select * from claim_agent_job($1)', [`worker-${i}`])).rows[0].job_type, 'generate-company-research')
    assert.equal((await db.query<{ job_type: string }>("select * from claim_agent_job('fifth-worker')")).rows[0].job_type, 'refresh-market-screener')
    assert.equal((await db.query<{ n: number }>("select count(*)::int n from agent_jobs where job_type='generate-company-research' and status='queued'")).rows[0].n, 2)
  } finally { await db.close() }
})

test('a pre-report failure can be retried twice without losing failure history or ignoring capacity', async () => {
  const db = await database()
  try {
    const first = await admit(db, 'TSLA', 'unchanged-report', 1)
    await db.query("update agent_jobs set status='failed',attempts=max_attempts,last_error='Provider collection failed before report creation' where id=$1", [first.id])
    await admit(db, 'GRID', 'occupies-capacity', 1, 'generate-etf-research')
    assert.equal((await admit(db, 'TSLA', 'unchanged-report', 1)).status, 'capacity')
    await db.exec("update agent_jobs set status='succeeded' where dedupe_key='occupies-capacity'")
    for (let retry = 1; retry <= 2; retry++) {
      const admitted = await admit(db, 'TSLA', 'unchanged-report', 1)
      assert.equal(admitted.id, first.id)
      assert.equal(admitted.admitted, true)
      const state = (await db.query<{ attempts: number; research_retry_count: number; last_error: string }>('select attempts,research_retry_count,last_error from agent_jobs where id=$1', [first.id])).rows[0]
      assert.equal(state.attempts, 0)
      assert.equal(state.research_retry_count, retry)
      assert.match(state.last_error, /before report creation/)
      await db.query("update agent_jobs set status='failed',attempts=max_attempts where id=$1", [first.id])
    }
    const exhausted = await admit(db, 'TSLA', 'unchanged-report', 1)
    assert.equal(exhausted.status, 'retry_exhausted')
    assert.equal(exhausted.admitted, false)
  } finally { await db.close() }
})

test('different manual and event queue keys cannot research the same owner and symbol simultaneously', async () => {
  const db = await database()
  try {
    await db.query("insert into agent_jobs(job_type,payload,priority) values('generate-company-research',$1,1),('event-refresh-company-research',$2,2),('generate-company-research',$3,3)", [
      JSON.stringify({ ownerId: 'owner', symbol: 'TSLA' }), JSON.stringify({ ownerId: 'owner', symbol: 'tsla' }), JSON.stringify({ ownerId: 'owner', symbol: 'LITE' }),
    ])
    assert.equal((await db.query<{ payload: {symbol: string} }>("select * from claim_agent_job('first')")).rows[0].payload.symbol, 'TSLA')
    assert.equal((await db.query<{ payload: {symbol: string} }>("select * from claim_agent_job('second')")).rows[0].payload.symbol, 'LITE')
    assert.equal((await db.query<{ attempts: number }>("select attempts from agent_jobs where job_type='event-refresh-company-research'")).rows[0].attempts, 0)
  } finally { await db.close() }
})
