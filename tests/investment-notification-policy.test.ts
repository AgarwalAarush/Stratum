import test from 'node:test'
import assert from 'node:assert/strict'

test('quiet-day delivery performs no outbox writes, claims, or provider calls', async () => {
  const originalFetch = globalThis.fetch
  const originalUrl = process.env.SUPABASE_URL
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  process.env.SUPABASE_URL = 'https://notification-policy.invalid'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-key'
  const calls: {table:string;method:string}[] = []
  globalThis.fetch = async (input, init) => {
    const url=new URL(String(input)); const table=url.pathname.split('/').at(-1)!
    calls.push({table,method:init?.method ?? 'GET'})
    assert.equal(url.hostname,'notification-policy.invalid')
    const data = table === 'recommendation_batches' ? [{id:'batch',manifest_id:'manifest',decision_date:'2026-09-07',published_at:'2026-09-07T14:00:00Z'}]
      : table === 'recommendation_versions' ? [{content:{symbol:'HOLDONLY',action:'hold',gateReasons:[],expiresAt:'2026-09-08T14:00:00Z'}}]
      : table === 'recommendation_input_manifests' ? {content_hash:'frozen',content:{names:[],evidence:[],portfolio:[],world:[]}}
      : table === 'investment_newsletter_outbox' ? null : []
    return new Response(JSON.stringify(data),{status:200,headers:{'content-type':'application/json'}})
  }
  try {
    const {sendInvestmentNewsletter}=await import('../lib/server/investment-newsletter.ts')
    const result=await sendInvestmentNewsletter(new Date('2026-09-07T15:00:00Z'))
    assert.equal(result.status,'skipped')
    assert.ok(calls.length>0)
    assert.ok(calls.every(c=>c.method==='GET'))
    assert.equal(calls.some(c=>c.table==='claim_investment_newsletter'),false)
  } finally {
    globalThis.fetch=originalFetch
    if(originalUrl===undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL=originalUrl
    if(originalKey===undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY=originalKey
  }
})
