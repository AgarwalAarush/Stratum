import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

test('World reservations carry across days, cap four units, and cannot count duplicates', async () => {
 const db=new PGlite()
 try {
  await db.exec('create role anon;create role authenticated;create role service_role;create table world_thinker_runs(id uuid primary key default gen_random_uuid());create table market_hypotheses(id uuid);')
  await db.exec(await readFile(new URL('../supabase/migrations/202610010008_world_investigation_budget.sql',import.meta.url),'utf8'))
  await assert.rejects(db.exec('insert into market_hypotheses values(gen_random_uuid())'),/legacy belief writer retired/)
  let exploration=0
  for(let day=1;day<=5;day++) {
   const date=`2026-10-0${day}T12:00:00Z`
   const preview=await db.query<{lane:string}>('select * from acquire_world_investigation_slot(null,$1,$2)',[JSON.stringify({}),date])
   assert.equal(preview.rows.length,4)
   for(const slot of preview.rows) {
    const run=(await db.query<{id:string}>('insert into world_thinker_runs default values returning id')).rows[0]
    const args=[run.id,JSON.stringify({question:'bounded',sourceId:'observed'}),date,slot.lane]
    const reserved=(await db.query<{slot:number;lane:string;available:boolean}>('select * from acquire_world_investigation_slot($1,$2,$3,$4)',args)).rows[0]
    assert.equal(reserved.available,true)
    if(reserved.lane==='exploration')exploration++
    assert.deepEqual((await db.query('select * from acquire_world_investigation_slot($1,$2,$3,$4)',args)).rows[0],reserved)
   }
   assert.equal((await db.query('select * from acquire_world_investigation_slot(null,$1,$2)',[JSON.stringify({}),date])).rows.length,0)
  }
  assert.equal(exploration,4)
  assert.equal((await db.query<{n:number}>('select count(*)::int n from world_investigation_slots')).rows[0].n,20)
 } finally {await db.close()}
})
