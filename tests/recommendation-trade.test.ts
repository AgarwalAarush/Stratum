import test from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { readTradeReview } from '../lib/server/recommendation-trade.ts'
test('trade confirmation rejects changed, cross-owner and expired reviews',()=>{
 process.env.MARKETS_SESSION_SECRET='test-only-secret-more-than-32-characters'
 function token(data:unknown){const payload=Buffer.from(JSON.stringify(data)).toString('base64url');return `${payload}.${createHmac('sha256',process.env.MARKETS_SESSION_SECRET!).update(`portfolio-review-v1:${payload}`).digest('hex')}`}
 const review=token({ownerId:'owner',expiresAt:Date.now()+10000,trade:{quantity:2}})
 assert.equal(readTradeReview(review,'owner').trade.quantity,2)
 assert.throws(()=>readTradeReview(review,'different-owner'),/expired/)
 assert.throws(()=>readTradeReview(review.replace(/.$/,'z'),'owner'),/changed/)
 assert.throws(()=>readTradeReview(token({ownerId:'owner',expiresAt:Date.now()-1}),'owner'),/expired/)
})

test('trade review checks owner holdings, refuses excessive fills, and queues ambiguous reports without Vercel credentials',async context=>{
 const {reviewRecommendationTrade,readRecommendationTradeJob}=await import('../lib/server/recommendation-trade.ts')
 const owner='00000000-0000-4000-8000-000000000001',portfolio='00000000-0000-4000-8000-000000000002'
 process.env.SUPABASE_URL='https://trade-review-test.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='test-only-key';delete process.env.OPENAI_API_KEY
 const urls:URL[]=[];let mode='review'
 const payload={ownerId:owner,recommendationId:'rec',instruction:'I sold two TSLA shares at one hundred dollars each.',occurredAt:new Date().toISOString()}
 context.mock.method(globalThis,'fetch',async(input:RequestInfo|URL)=>{
  const url=new URL(String(input));urls.push(url);const table=url.pathname.split('/').at(-1)
  if(table==='recommendation_versions') return Response.json({id:'rec',symbol:'TSLA',portfolio_id:portfolio,issued_at:new Date(Date.now()-60000).toISOString()})
  if(table==='portfolios') return Response.json([{id:portfolio,owner_id:owner,name:'Manual',kind:mode==='brokerage'?'brokerage':'manual',initial_funds:1000,started_at:'2026-01-01',created_at:'2026-01-01'}])
  if(table==='portfolio_transactions') return Response.json([{id:'tx',portfolio_id:portfolio,owner_id:owner,action:'buy',symbol:'TSLA',quantity:3,price_per_share:80,fees:0,occurred_at:'2026-01-01',created_at:'2026-01-01',voided_at:null}])
  if(table==='portfolio_confirmations') return Response.json(url.searchParams.get('limit')?null:[])
  if(table==='brokerage_sync_runs') return Response.json([{portfolio_id:portfolio,captured_at:new Date().toISOString(),brokerage_account_snapshots:[{cash_balance:1000,equity_value:0,total_value:1000}],brokerage_position_snapshots:[]}])
  if(table==='agent_jobs') return Response.json(mode==='review'?{id:'job'}:{id:'job',status:'succeeded',payload})
  if(table==='agent_runs') return Response.json({output:{data:{side:'sell',symbol:'TSLA',quantity:2,price:100,fees:0,missing:[]}}})
  return Response.json([])
 })
 const preview=await reviewRecommendationTrade(owner,{recommendationId:'rec',instruction:'Sold 2 shares of TSLA at $100',occurredAt:new Date().toISOString()})
 assert.ok(!('queued' in preview));if(!('queued' in preview)){assert.equal(preview.heldShares,3);assert.equal(preview.resultingShares,1);assert.equal(preview.cashChange,200)}
 await assert.rejects(reviewRecommendationTrade(owner,{recommendationId:'rec',instruction:'Sold 4 shares of TSLA at $100',occurredAt:new Date().toISOString()}),/exceeds/)
 const queued=await reviewRecommendationTrade(owner,payload);assert.ok('queued' in queued)
 mode='complete';const completed=await readRecommendationTradeJob(owner,'job');assert.ok(!('queued' in completed));if(!('queued' in completed))assert.equal(completed.reviewer,'Codex worker review')
 mode='brokerage'
 const reported=await reviewRecommendationTrade(owner,{...payload,instruction:'Sold 4 shares of TSLA at $100'})
 assert.ok(!('queued' in reported));if(!('queued' in reported)){assert.equal(reported.heldShares,0);assert.equal(reported.resultingShares,null);assert.equal(reported.brokerage,true)}
 assert.equal(urls.find(url=>url.pathname.endsWith('agent_jobs')&&url.searchParams.get('job_type'))?.searchParams.get('payload->>ownerId'),`eq.${owner}`)
})
