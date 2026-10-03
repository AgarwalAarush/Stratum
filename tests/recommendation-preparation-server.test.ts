import test from 'node:test'
import assert from 'node:assert/strict'
import { prepareDailyRecommendations, reconcileRecommendationEvidence } from '../lib/server/recommendation-preparation.ts'

test('source repair queues a durable continuation before freezing and later evidence creates a new edition', async t => {
  process.env.SUPABASE_URL='https://preparation-test.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY='fixture-key'
  const owner='00000000-0000-4000-8000-000000000001', portfolio='00000000-0000-4000-8000-000000000002'
  const now=new Date('2026-09-30T14:00:00Z')
  let manifestWrites=0, reconcile=false, active=false
  t.mock.method(globalThis,'fetch',async (input: RequestInfo | URL, init?: RequestInit) => {
    const url=new URL(String(input)), table=url.pathname.split('/').at(-1)
    if (table==='recommendation_input_manifests') {
      if (init?.method==='POST') manifestWrites++
      return Response.json(reconcile ? {cutoff:'2026-09-30T13:00:00Z',universe:[{symbol:'ABC',selected:true}]} : [])
    }
    if (table==='recommendation_batches') return Response.json({manifest_id:'old-manifest'})
    if (table==='reserve_research_investigation') return Response.json(true)
    if (table==='agent_jobs') return Response.json(active ? [{payload:{ownerId:owner}}] : [])
    const fixtures:Record<string,unknown>={
      portfolios:[{id:portfolio,owner_id:owner,name:'Manual',kind:'manual',created_at:'2026-01-01'}],
      portfolio_confirmations:reconcile ? [] : [{portfolio_id:portfolio,as_of:now.toISOString(),confirmed_at:now.toISOString(),content:{asOf:now.toISOString(),cash:100,positions:[{symbol:'ABC',quantity:1,costBasisPerShare:100}]}}],
      market_assets:[{symbol:'ABC',alpaca_id:'abc'}],
      equity_research_notes:reconcile ? [{id:'new-research',symbol:'ABC'}] : [],
      market_bars_daily:Array.from({length:20},()=>({close:100,volume:10000,trading_date:'2026-09-29'})),
    }
    return Response.json(fixtures[table!] ?? [])
  })
  const queued:Array<{type:string;payload:Record<string,unknown>;key:string}>=[]
  const enqueue=async (type:string,payload:Record<string,unknown>,key:string)=>{
    queued.push({type,payload,key});return {id:`00000000-0000-4000-8000-${String(queued.length).padStart(12,'0')}`,deduplicated:false}
  }
  const result=await prepareDailyRecommendations(owner,'daily',enqueue,now)
  assert.equal('preparing' in result && result.preparing,true)
  assert.equal(manifestWrites,0)
  assert.deepEqual(queued.map(q=>q.type),['refresh-market-screener','generate-company-research','generate-daily-recommendations'])
  assert.equal(queued.at(-1)!.payload.phase,'publish')
  assert.equal((queued.at(-1)!.payload.dependencyJobIds as string[]).length,2)
  assert.match(String(queued.at(-1)!.payload.editionKey),/^daily:prepared:/)
  reconcile=true
  queued.length=0
  await reconcileRecommendationEvidence(enqueue,owner)
  assert.equal(queued.length,1)
  assert.match(String(queued[0].payload.editionKey),/^evidence:/)
  active=true
  assert.equal(await reconcileRecommendationEvidence(enqueue,owner),null)
  assert.equal(queued.length,1)
})
