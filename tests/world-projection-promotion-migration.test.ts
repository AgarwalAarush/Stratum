import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

async function createProjectionDatabase() {
  const db = new PGlite()
  await db.exec('create role anon; create role authenticated; create role service_role;')
  const legacy = await readFile(new URL('../supabase/migrations/202608170001_world_thinker.sql', import.meta.url), 'utf8')
  await db.exec(legacy.slice(legacy.indexOf('create table if not exists public.world_repository_projections ('), legacy.indexOf('create table if not exists public.world_opportunity_leads (')))
  await db.exec(await readFile(new URL('../supabase/migrations/202610030005_world_projection_checked_promotion.sql', import.meta.url), 'utf8'))
  return db
}

test('checked canonical promotion rejects a stale concurrent predecessor without rolling back current authority', async () => {
  const db = await createProjectionDatabase()
  try {
    await db.exec(await readFile(new URL('../supabase/migrations/202610030006_world_projection_authority_time.sql', import.meta.url), 'utf8'))
    await db.exec("insert into world_repository_projections(commit_sha,branch,file_count,projected_at) values ('first','main',1,'2000-01-01'),('second','main',2,'2000-01-01'),('third','main',3,'2000-01-01')")
    const promote = (commit: string, expected: string | null) => db.query<{ commit_sha: string }>('select (promote_world_repository_projection_if_current($1,$2)).commit_sha', [commit, expected])
    const current = async () => (await db.query<{ commit_sha: string }>('select commit_sha from world_repository_projections where is_canonical')).rows.map(row => row.commit_sha)
    const authorityTime = async (commit: string) => (await db.query<{ time: string }>('select canonical_promoted_at::text time from world_repository_projections where commit_sha=$1', [commit])).rows[0].time

    assert.equal((await promote('first', null)).rows[0].commit_sha, 'first')
    const firstTime = await authorityTime('first')
    assert.ok(Date.parse(firstTime) > Date.parse('2000-01-01'))
    assert.deepEqual((await db.query("select commit_sha from world_repository_projections where is_canonical and canonical_promoted_at <= '2001-01-01'")).rows, [])
    assert.equal((await db.query<{ unchanged: boolean }>("select projected_at = '2000-01-01'::timestamptz unchanged from world_repository_projections where commit_sha='first'")).rows[0].unchanged, true)
    await assert.rejects(promote('second', null), /Canonical World changed before promotion/)
    assert.deepEqual(await current(), ['first'])
    assert.equal((await promote('second', 'first')).rows[0].commit_sha, 'second')
    const secondTime = await authorityTime('second')
    // The losing writer planned against first while the winning writer advanced
    // to second. It cannot restore first or promote its stale third candidate.
    await assert.rejects(promote('first', 'first'), /Canonical World changed before promotion/)
    await assert.rejects(promote('third', 'first'), /Canonical World changed before promotion/)
    assert.deepEqual(await current(), ['second'])
    assert.equal((await promote('second', 'first')).rows[0].commit_sha, 'second')
    assert.equal(await authorityTime('second'), secondTime)
    assert.equal(await authorityTime('first'), firstTime)
    await assert.rejects(promote('missing', 'second'), /World projection does not exist/)
    assert.deepEqual(await current(), ['second'])

    for (const signature of ['promote_world_repository_projection_if_current(text,text)', 'promote_world_repository_projection(text)']) {
      const privileges = await db.query<{ anon: boolean; authenticated: boolean; service: boolean }>(
        "select has_function_privilege('anon',$1,'EXECUTE') anon, has_function_privilege('authenticated',$1,'EXECUTE') authenticated, has_function_privilege('service_role',$1,'EXECUTE') service", [signature])
      assert.deepEqual(privileges.rows[0], { anon: false, authenticated: false, service: true })
    }
    await db.exec('set role anon')
    await assert.rejects(promote('third', 'second'), /permission denied/)
    await db.exec('reset role; set role authenticated')
    await assert.rejects(promote('third', 'second'), /permission denied/)
    await db.exec('reset role; set role service_role')
    assert.equal((await promote('third', 'second')).rows[0].commit_sha, 'third')
    await db.exec('reset role')
    assert.deepEqual(await current(), ['third'])
  } finally {
    await db.close()
  }
})

test('authority time backfill and legacy promotion conservatively preserve projection and retry times', async () => {
  const db = await createProjectionDatabase()
  try {
    await db.exec("insert into world_repository_projections(commit_sha,branch,file_count,projected_at,is_canonical) values ('existing','main',1,'2000-01-01',true),('shadow','main',1,'2000-01-01',false)")
    await db.exec(await readFile(new URL('../supabase/migrations/202610030006_world_projection_authority_time.sql', import.meta.url), 'utf8'))
    const rows = (await db.query<{ commit_sha: string; authority: string | null; original: boolean }>("select commit_sha,canonical_promoted_at::text authority,projected_at='2000-01-01'::timestamptz original from world_repository_projections order by commit_sha")).rows
    assert.equal(rows[0].commit_sha, 'existing')
    assert.ok(Date.parse(rows[0].authority!) > Date.parse('2000-01-01'))
    assert.equal(rows[0].original, true)
    assert.equal(rows[1].authority, null)
    await db.query('select promote_world_repository_projection($1)', ['shadow'])
    const promoted = (await db.query<{ authority: string }>("select canonical_promoted_at::text authority from world_repository_projections where commit_sha='shadow'")).rows[0].authority
    assert.ok(Date.parse(promoted) > Date.parse('2000-01-01'))
    await db.query('select promote_world_repository_projection($1)', ['shadow'])
    assert.equal((await db.query<{ authority: string }>("select canonical_promoted_at::text authority from world_repository_projections where commit_sha='shadow'")).rows[0].authority, promoted)
  } finally {
    await db.close()
  }
})
