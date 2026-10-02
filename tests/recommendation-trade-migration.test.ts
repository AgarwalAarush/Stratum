import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
const owner='00000000-0000-4000-8000-000000000001',portfolio='00000000-0000-4000-8000-000000000002',rec='00000000-0000-4000-8000-000000000003'
test('reviewed trade atomically records ledger and outcome, retries once, and rolls back invalid fills',async()=>{
 const db=new PGlite()
 try {
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create table portfolios(id uuid primary key,owner_id uuid,kind text,initial_funds numeric);
 create table portfolio_confirmations(id uuid default gen_random_uuid(),owner_id uuid,portfolio_id uuid,request_id uuid,as_of timestamptz,confirmed_at timestamptz default now(),content jsonb,content_hash text);
 create table recommendation_versions(id uuid primary key,owner_id uuid,portfolio_id uuid,symbol text,issued_at timestamptz);
 create table portfolio_transactions(id uuid default gen_random_uuid() primary key,owner_id uuid,portfolio_id uuid,action text,symbol text,quantity numeric,price_per_share numeric,fees numeric,occurred_at date,notes text,source text,external_key text,created_at timestamptz default now(),voided_at timestamptz,unique(portfolio_id,external_key));
 create table recommendation_owner_events(id uuid default gen_random_uuid(),owner_id uuid,recommendation_id uuid,request_id uuid,event_type text,rationale text,details jsonb,occurred_at timestamptz,unique(owner_id,request_id));
 insert into portfolios values('${portfolio}','${owner}','manual',1000);
 insert into recommendation_versions values('${rec}','${owner}','${portfolio}','TSLA',now()-interval '1 day');`)
 await db.exec(await readFile(new URL('../supabase/migrations/202610020001_reviewed_recommendation_trades.sql',import.meta.url),'utf8'))
 const now=new Date(),occurredAt=now.toISOString(),date=now.toLocaleDateString('en-CA',{timeZone:'America/New_York'})
 const trade={action:'buy',symbol:'TSLA',quantity:2,pricePerShare:100,fees:1,occurredAt:date,notes:'Bought two actual shares'}
 const request='00000000-0000-4000-8000-000000000004'
 const call=(id:string,t:unknown,o=owner)=>db.query('select record_reviewed_recommendation_trade($1,$2,$3,$4,$5) as id',[o,rec,id,JSON.stringify(t),occurredAt])
 const a=await call(request,trade),b=await call(request,trade);assert.equal(a.rows[0].id,b.rows[0].id)
 assert.equal((await db.query('select * from portfolio_transactions')).rows.length,1)
 const events=await db.query<{details:{transactionId:string}}>('select * from recommendation_owner_events');assert.equal(events.rows[0].details.transactionId,a.rows[0].id)
 await assert.rejects(call('00000000-0000-4000-8000-000000000005',{...trade,action:'sell',quantity:3}),/exceeds/)
 await assert.rejects(call('00000000-0000-4000-8000-000000000006',{...trade,quantity:20}),/cash/)
 await assert.rejects(call('00000000-0000-4000-8000-000000000007',{...trade,symbol:'NVDA'}),/Invalid/)
 await assert.rejects(call('00000000-0000-4000-8000-000000000008',trade,'00000000-0000-4000-8000-000000000099'))
 assert.equal((await db.query('select * from portfolio_transactions')).rows.length,1)
 assert.equal((await db.query('select * from recommendation_owner_events')).rows.length,1)
 await db.query('insert into portfolio_confirmations(owner_id,portfolio_id,as_of,content) values($1,$2,$3,$4)',[owner,portfolio,new Date(now.getTime()-1000).toISOString(),JSON.stringify({asOf:new Date(now.getTime()-1000).toISOString(),cash:400,positions:[{symbol:'TSLA',quantity:3,costBasisPerShare:80}]})])
 await call('00000000-0000-4000-8000-000000000009',{...trade,action:'sell',quantity:1,previousQuantity:3,previousCash:400})
 const capture=await db.query<{content:{cash:number;positions:{quantity:number}[]}}> ('select content from portfolio_confirmations order by confirmed_at desc limit 1')
 assert.equal(capture.rows[0].content.cash,499);assert.equal(capture.rows[0].content.positions[0].quantity,2)

 }finally{await db.close()}
})
