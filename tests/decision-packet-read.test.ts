import test from 'node:test'
import assert from 'node:assert/strict'
import {loadDecisionPackets} from '../lib/server/recommendations.ts'

test('decision packet reads bind exact versions, owner and cutoff in bounded batches',async () => {
 process.env.SUPABASE_URL='http://127.0.0.1:54321'
 process.env.SUPABASE_SERVICE_ROLE_KEY='fixture'
 const original=globalThis.fetch, seen:string[][]=[]
 globalThis.fetch=async input => {
   const u=new URL(String(input))
   assert.equal(u.searchParams.get('owner_id'),'eq.owner')
   assert.equal(u.searchParams.get('generated_at'),'lte.2026-09-07T00:00:00Z')
   const ids=u.searchParams.get('id')!.slice(4,-1).split(',')
   assert.ok(ids.length<=5);seen.push(ids)
   return new Response(JSON.stringify(ids.map(id=>({id,packet:{version:'frozen'}}))),{headers:{'Content-Type':'application/json'}})
 }
 try {
   const ids=['p1','p2','p3','p4','p5','p6','p1']
   const rows=await loadDecisionPackets('company_packets','owner','2026-09-07T00:00:00Z',ids)
   assert.equal(rows.length,6);assert.equal(seen.length,2)
   assert.deepEqual(await loadDecisionPackets('company_packets','owner','2026-09-07T00:00:00Z',[]),[])
   assert.equal(seen.length,2)
 } finally {globalThis.fetch=original}
})
