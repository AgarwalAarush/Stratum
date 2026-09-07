import assert from 'node:assert/strict'
import test from 'node:test'
import {PGlite} from '@electric-sql/pglite'
import {readFile} from 'node:fs/promises'
test('ETF research persists for the private Markets owner without creating an Auth identity',async()=>{
 const db=new PGlite()
 try{
  await db.exec('create schema auth;create table auth.users(id uuid primary key);create table market_users(id uuid primary key,label text);create table market_assets(symbol text primary key);')
  await db.exec(await readFile(new URL('../supabase/migrations/202608020001_etf_research.sql',import.meta.url),'utf8'))
  await db.exec(await readFile(new URL('../supabase/migrations/202609070010_etf_private_owner.sql',import.meta.url),'utf8'))
  const owner='00000000-0000-4000-8000-000000000001'
  await db.query('insert into market_users(id,label) values($1,$2)',[owner,'Private owner'])
  await db.exec("insert into market_assets(symbol) values('GRID')")
  const result=await db.query<{id:string}>("insert into etf_research_packets(symbol,owner_id,version,packet,data_as_of) values('GRID',$1,1,'{}',now()) returning id",[owner])
  await db.query("insert into etf_research_notes(symbol,owner_id,version,etf_research_packet_id,data_as_of) values('GRID',$1,1,$2,now())",[owner,result.rows[0].id])
  assert.equal((await db.query('select * from auth.users')).rows.length,0)
  await assert.rejects(()=>db.query('delete from market_users where id=$1',[owner]),/foreign key/)
 }finally{await db.close()}
})
