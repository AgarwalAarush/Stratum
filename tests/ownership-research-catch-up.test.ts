import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { ownershipCatchUpSql } from '../lib/server/ownership-research-catch-up.ts'

test('explicit catch-up moves only queued owned upgrades atomically and preserves normal eight-slot gates', async () => {
  const db = new PGlite()
  const owner = '00000000-0000-4000-8000-000000000001', other = '00000000-0000-4000-8000-000000000002'
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role;
      create table market_assets(symbol text primary key,active boolean,tradable boolean);
      create table agent_jobs(id uuid primary key default gen_random_uuid(),job_type text,status text,payload jsonb,dedupe_key text,priority integer default 50,run_after timestamptz,updated_at timestamptz);`)
    await db.exec(await readFile(new URL('../supabase/migrations/202610030001_research_interest_coverage.sql', import.meta.url), 'utf8'))
    const day = (await db.query<{investigation_date:string}>("select to_char(now() at time zone 'America/New_York','YYYY-MM-DD') as investigation_date")).rows[0].investigation_date
    const reserve = async (symbol: string, date=day, who=owner, key=symbol, start=false) => (await db.query<{ok:boolean}>('select reserve_research_investigation($1,$2,$3,\'other\',$4,2,$5) ok', [who,date,symbol,key,start])).rows[0].ok
    for (let i=0;i<8;i++) assert.equal(await reserve(`A${i}`), true)
    const ids: string[] = []
    for (let i=0;i<18;i++) {
      const symbol=`B${i}`, key=`research-upgrade:${owner}:${symbol}:2`
      const job=(await db.query<{id:string}>(`insert into agent_jobs(job_type,status,payload,dedupe_key,run_after)
        values($1,'queued',$2,$3,now()+interval '1 day') returning id`, [i%3===0?'generate-etf-research':'generate-company-research',JSON.stringify({ownerId:owner,symbol,forceFullResearch:true,targetContractVersion:2,researchPriority:'owned'}),key])).rows[0]
      ids.push(job.id)
      await db.query(`insert into research_investigation_slots(owner_id,investigation_date,symbol,contract_version,lane,reservation_key,job_id)
        values($1,$2::date+1,$3,2,'owned',$4,$5)`,[owner,day,symbol,key,job.id])
    }
    const input={ownerId:owner,date:day,jobIds:ids,key:'explicit-owner-request',reason:'Owner asked to complete the remaining upgrades today'}
    await assert.rejects(db.exec(ownershipCatchUpSql({...input,ownerId:other})),/queued, unstarted owned/)
    await db.exec('rollback')
    await db.query("update agent_jobs set status='running' where id=$1",[ids[0]])
    await assert.rejects(db.exec(ownershipCatchUpSql(input)),/queued, unstarted owned/)
    await db.exec('rollback')
    assert.equal((await db.query<{n:number}>("select count(*)::int n from agent_jobs where payload ? 'ownerRequestedCatchUp'")).rows[0].n,0)
    await db.query("update agent_jobs set status='queued' where id=$1",[ids[0]])
    await db.exec(ownershipCatchUpSql(input))
    assert.equal((await db.query<{n:number}>('select count(*)::int n from research_investigation_slots where investigation_date=$1',[day])).rows[0].n,26)
    assert.equal(await reserve('EXTRA'),false)
    assert.equal(await reserve('OTHER',day,other),true)
    for(let i=0;i<8;i++)assert.equal(await reserve(`NEXT${i}`,'2099-01-01'),true)
    assert.equal(await reserve('NEXT8','2099-01-01'),false)
    assert.equal(await reserve('B0',day,owner,`research-upgrade:${owner}:B0:2`,true),true)
    assert.equal(await reserve('B0',day,owner,'unrelated-refresh',true),false)
    await db.query("update agent_jobs set status='succeeded' where id=$1",[ids[0]])
    await db.exec(ownershipCatchUpSql(input))
    assert.equal((await db.query<{status:string;model:string}>('select status,payload->>\'researchModel\' model from agent_jobs where id=$1',[ids[0]])).rows[0].status,'succeeded')
    assert.equal((await db.query<{n:number}>('select count(*)::int n from agent_jobs where payload->>\'researchModel\'=\'gpt-6.1-sol\'')).rows[0].n,18)
  } finally { await db.close() }
})
