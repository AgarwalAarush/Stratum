import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const release = 'a'.repeat(40)
type Gate = { paused: boolean; expected_release_sha: string | null; running_jobs: number; running_attempts: number }
type PlanNode = { 'Node Type': string; 'Relation Name'?: string; 'Index Name'?: string; Plans?: PlanNode[] }
const planNodes = (node: PlanNode): PlanNode[] => [node, ...(node.Plans ?? []).flatMap(planNodes)]

async function database() {
  const db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table agent_jobs (
      id uuid primary key, job_type text not null, status text not null default 'queued',
      run_after timestamptz not null default now(), attempts integer not null default 0,
      max_attempts integer not null default 3, priority integer not null default 50,
      created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
      claimed_by text, claimed_at timestamptz
    );
    create table agent_runs (id uuid primary key, job_id uuid references agent_jobs, status text not null);
  `)
  await db.exec(await readFile(new URL('../supabase/migrations/202610030004_worker_claim_gate.sql', import.meta.url), 'utf8'))
  return db
}

async function status(db: PGlite) {
  return (await db.query<{ gate: Gate }>('select worker_claim_gate_status() gate')).rows[0].gate
}

async function setGate(db: PGlite, paused: boolean, sha = release) {
  return (await db.query<{ gate: Gate }>('select set_worker_claim_gate($1,$2,$3) gate', [paused, 'Coordinated release', sha])).rows[0].gate
}

test('a durable claim pause preserves queued work and lets existing attempts finish', async () => {
  const db = await database()
  try {
    await db.exec(`insert into agent_jobs(id,job_type,priority) values
      ('00000000-0000-4000-8000-000000000001','generate-company-research',10),
      ('00000000-0000-4000-8000-000000000002','refresh-world-events',20)`)
    const first = (await db.query<{ id: string; attempts: number }>("select * from claim_agent_job('worker')")).rows[0]
    assert.equal(first.id, '00000000-0000-4000-8000-000000000001')
    assert.equal(first.attempts, 1)
    await db.exec(`insert into agent_runs values ('00000000-0000-4000-8000-000000000010','${first.id}','running')`)
    const paused = await setGate(db, true)
    assert.equal(paused.paused, true)
    assert.equal(paused.running_jobs, 1)
    assert.equal(paused.running_attempts, 1)
    assert.equal((await db.query<{ claimed: unknown }>("select claim_agent_job('another-worker') claimed")).rows[0].claimed, null)
    assert.deepEqual((await db.query('select status,attempts,claimed_by from agent_jobs order by priority')).rows, [
      { status: 'running', attempts: 1, claimed_by: 'worker' }, { status: 'queued', attempts: 0, claimed_by: null },
    ])
    await db.exec("update agent_runs set status='succeeded'; update agent_jobs set status='succeeded' where status='running'")
    assert.equal((await status(db)).running_jobs, 0)
    assert.equal((await status(db)).running_attempts, 0)
    await assert.rejects(setGate(db, false, 'b'.repeat(40)), /does not match/)
    assert.equal((await status(db)).paused, true)
    assert.equal((await setGate(db, false)).paused, false)
    const next = (await db.query<{ id: string; attempts: number }>("select * from claim_agent_job('new-release')")).rows[0]
    assert.equal(next.id, '00000000-0000-4000-8000-000000000002')
    assert.equal(next.attempts, 1)
  } finally { await db.close() }
})

test('the gate retains World serialization, job priority, deadlines and attempt limits', async () => {
  const db = await database()
  try {
    await db.exec(`insert into agent_jobs(id,job_type,status,priority,attempts,max_attempts,run_after) values
      ('00000000-0000-4000-8000-000000000001','run-world-thinker','running',1,1,3,now()),
      ('00000000-0000-4000-8000-000000000002','run-world-thinker','queued',1,0,3,now()),
      ('00000000-0000-4000-8000-000000000003','refresh-world-events','queued',2,3,3,now()),
      ('00000000-0000-4000-8000-000000000004','refresh-world-events','queued',3,0,3,now()+interval '1 hour'),
      ('00000000-0000-4000-8000-000000000005','refresh-world-events','queued',4,0,3,now())`)
    assert.equal((await db.query<{ id: string }>("select * from claim_agent_job('worker')")).rows[0].id, '00000000-0000-4000-8000-000000000005')
    assert.equal((await db.query<{ claimed: unknown }>("select claim_agent_job('worker') claimed")).rows[0].claimed, null)
  } finally { await db.close() }
})

test('claim control is private and invalid release metadata leaves the gate unchanged', async () => {
  const db = await database()
  try {
    const privileges = await db.query("select has_function_privilege('anon','worker_claim_gate_status()','EXECUTE') public_read, has_function_privilege('authenticated','set_worker_claim_gate(boolean,text,text)','EXECUTE') public_write, has_function_privilege('service_role','set_worker_claim_gate(boolean,text,text)','EXECUTE') private_write")
    assert.deepEqual(privileges.rows, [{ public_read: false, public_write: false, private_write: true }])
    await assert.rejects(setGate(db, true, 'invalid'), /valid release SHA/)
    await assert.rejects(db.query('select set_worker_claim_gate(true,null,$1)', [release]), /reason is required/)
    assert.equal((await status(db)).paused, false)
  } finally { await db.close() }
})

test('running-work indexes remove history scans without changing pause or drain evidence', async () => {
  const db = await database()
  try {
    await db.exec(`alter table agent_jobs add column retained_context text;
      alter table agent_runs add column retained_output text;
      insert into agent_jobs(id,job_type,status,retained_context)
        select md5('job-'||n)::uuid,'refresh-world-events',case when n<=3 then 'running' else 'succeeded' end,
          repeat('retained investigation context ',40) from generate_series(1,1500) n;
      insert into agent_runs(id,job_id,status,retained_output)
        select md5('run-'||n)::uuid,md5('job-'||n)::uuid,case when n<=2 or n=4 then 'running' else 'succeeded' end,
          repeat('retained attempt output ',50) from generate_series(1,1500) n;
      insert into agent_runs(id,job_id,status,retained_output)
        values(md5('extra-run')::uuid,md5('job-1')::uuid,'running','another unfinished attempt');`)
    await db.exec('vacuum analyze agent_jobs')
    await db.exec('vacuum analyze agent_runs')
    await setGate(db, true)
    const gateSql = (await db.query<{ prosrc: string }>("select prosrc from pg_proc where oid='worker_claim_gate_status()'::regprocedure")).rows[0].prosrc
    const explain = async () => planNodes((await db.query<{ 'QUERY PLAN': Array<{ Plan: PlanNode }> }>(`explain (format json) ${gateSql}`)).rows[0]['QUERY PLAN'][0].Plan)
    const before = await explain()
    for (const relation of ['agent_jobs', 'agent_runs']) assert.ok(before.some(node => node['Node Type'] === 'Seq Scan' && node['Relation Name'] === relation))
    const expected = { paused: true, expected_release_sha: release, running_jobs: 3, running_attempts: 3 }
    const evidence = (gate: Gate) => ({ paused: gate.paused, expected_release_sha: gate.expected_release_sha, running_jobs: gate.running_jobs, running_attempts: gate.running_attempts })
    assert.deepEqual(evidence(await status(db)), expected)
    await db.exec(await readFile(new URL('../supabase/migrations/202610030009_worker_claim_gate_indexes.sql', import.meta.url), 'utf8'))
    const after = await explain()
    for (const index of ['agent_jobs_running_gate', 'agent_runs_running_gate']) assert.ok(after.some(node => node['Node Type'] === 'Index Only Scan' && node['Index Name'] === index), `default planning must use ${index}`)
    assert.equal(after.some(node => node['Node Type'] === 'Seq Scan' && ['agent_jobs', 'agent_runs'].includes(node['Relation Name'] ?? '')), false)
    const indexed = await status(db)
    assert.deepEqual(evidence(indexed), expected)
    assert.equal((await db.query<{ claimed: unknown }>("select claim_agent_job('new-worker') claimed")).rows[0].claimed, null)
    // A still-running historical attempt on a finished job does not prevent
    // draining. The join continues to count only attempts on running jobs.
    await db.exec("update agent_jobs set status='succeeded' where status='running'")
    const drained = await status(db)
    assert.equal(drained.paused, true)
    assert.equal(drained.running_jobs, 0)
    assert.equal(drained.running_attempts, 0)
    assert.equal((await db.query<{ count: number }>("select count(*) from agent_runs where status='running'")).rows[0].count, 4)
  } finally { await db.close() }
})
