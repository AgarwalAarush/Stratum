import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'
import {loadDecisionHistory} from '../lib/server/recommendations.ts'

test('owner narrative reads preserve complete history, isolation and cutoff through bounded transient retries',async t=>{
 process.env.SUPABASE_URL='https://decision-history-test.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='test-only-key'
 const requests:URL[]=[],source=Array.from({length:43},(_,i)=>({id:String(i),symbol:'ABC',content:{complete:`report-${i}`}}));let transient=true,permanent=false
 t.mock.method(globalThis,'fetch',async input=>{
  const url=new URL(String(input));requests.push(url)
  assert.equal(url.searchParams.get('owner_id'),'eq.owner-a');assert.equal(url.searchParams.get('generated_at'),'lte.2026-10-03T14:00:00Z')
  const offset=Number(url.searchParams.get('offset')??0),limit=Number(url.searchParams.get('limit'))
  assert.equal(limit,20)
  if(permanent)return Response.json({code:'57014',message:'statement timeout'},{status:400})
  if(offset===20&&transient){transient=false;return Response.json({code:'57014',message:'statement timeout'},{status:400})}
  return Response.json(source.slice(offset,offset+limit))
 })
 assert.deepEqual(await loadDecisionHistory('equity_research_notes','owner-a','2026-10-03T14:00:00Z'),source)
 assert.deepEqual(requests.map(r=>Number(r.searchParams.get('offset')??0)),[0,20,20,40])
 permanent=true;const before=requests.length
 await assert.rejects(loadDecisionHistory('equity_research_notes','owner-a','2026-10-03T14:00:00Z'),/statement timeout/)
 assert.equal(requests.length-before,2)
})

test('bounded freeze is immutable, idempotent, owner isolated and private',async()=>{
 const db=new PGlite()
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role;
   create table recommendation_input_manifests(id uuid primary key,owner_id uuid not null,decision_date date not null,decision_cutoff timestamptz not null,policy_version text not null,edition_key text not null,content_hash text not null,content jsonb not null,created_at timestamptz not null default now(),unique(owner_id,decision_date,policy_version,edition_key),check(decision_cutoff<=created_at));`)
  await db.exec(await readFile(new URL('../supabase/migrations/202610030002_recommendation_input_freeze.sql',import.meta.url),'utf8'))
  const owner='00000000-0000-4000-8000-000000000001',id='00000000-0000-4000-8000-000000000011',other='00000000-0000-4000-8000-000000000002',cutoff=new Date(Date.now()-60_000).toISOString()
  const content={id,ownerId:owner,date:cutoff.slice(0,10),policy:'prospective-v1.7',editionKey:'test',cutoff,names:[],evidence:[{captured:'complete disclosure'}]}
  const manifest={id,owner_id:owner,decision_date:content.date,decision_cutoff:cutoff,policy_version:content.policy,edition_key:content.editionKey,content_hash:'a'.repeat(64),content}
  const freeze=async(value:unknown)=>(await db.query<{id:string}>('select freeze_recommendation_input($1::jsonb) id',[JSON.stringify(value)])).rows[0].id
  assert.equal(await freeze(manifest),id)
  const replacementId='00000000-0000-4000-8000-000000000012'
  assert.equal(await freeze({...manifest,id:replacementId,content:{...content,id:replacementId,evidence:[]}}),id)
  assert.deepEqual((await db.query<{content:unknown}>('select content from recommendation_input_manifests where id=$1',[id])).rows[0].content,content)
  assert.equal(await freeze({...manifest,id:replacementId,owner_id:other,content:{...content,id:replacementId,ownerId:other}}),replacementId)
  await assert.rejects(freeze({...manifest,content:{...content,ownerId:other}}),/Invalid bounded/)
  await assert.rejects(freeze({...manifest,content_hash:'invalid'}),/Invalid bounded/)
  const privileges=await db.query<{public_access:boolean;private_access:boolean}>("select has_function_privilege('anon','freeze_recommendation_input(jsonb)','EXECUTE') public_access,has_function_privilege('service_role','freeze_recommendation_input(jsonb)','EXECUTE') private_access")
  assert.deepEqual(privileges.rows,[{public_access:false,private_access:true}])
  const configuration=await db.query<{proconfig:string[]}>('select proconfig from pg_proc where proname=$1',['freeze_recommendation_input'])
  assert.ok(configuration.rows[0].proconfig.includes('statement_timeout=25s'))
 }finally{await db.close()}
})
