import test from 'node:test'
import assert from 'node:assert/strict'
import { recordResearchRefresh, fetchResearchBaseline } from '../lib/server/research-refresh.ts'
import type { CompanyPacket, EquityResearchNote } from '../lib/markets/types.ts'
test('price-only evidence writes a refresh check without invoking a model or changing the frozen report',async t=>{
 const env={url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SERVICE_ROLE_KEY,exec:process.env.CODEX_EXECUTABLE}
 process.env.SUPABASE_URL='https://refresh-test.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='test-key';process.env.CODEX_EXECUTABLE='/missing/model-must-not-run'
 t.after(()=>{process.env.SUPABASE_URL=env.url;process.env.SUPABASE_SERVICE_ROLE_KEY=env.key;process.env.CODEX_EXECUTABLE=env.exec})
 const baseline={id:'frozen-packet',symbol:'ABC',version:1,company:{cik:'issuer'},financialStatements:{incomeQuarterly:[{date:'2026-06-30',revenue:10}]},priceHistory:{latestPrice:100},sources:[{id:'source',url:'https://issuer.example/results'}]}
 const report={id:'frozen-note',version:1,generatedAt:new Date().toISOString(),fairValue:120} as EquityResearchNote
 const writes: Array<Record<string,unknown>>=[]
 t.mock.method(globalThis,'fetch',async(input:RequestInfo|URL,init?:RequestInit)=>{
   const url=new URL(String(input)),table=url.pathname.split('/').at(-1)
   if(table==='equity_research_notes')return Response.json({company_packet_id:'frozen-packet'})
   if(table==='company_packets'){assert.equal(url.searchParams.get('id'),'eq.frozen-packet');return Response.json({packet:baseline})}
   if(init?.method==='POST'){writes.push(JSON.parse(String(init.body)));return Response.json([])}
   throw new Error(`Unexpected model or data request: ${url.hostname}`)
 })
 const priorPacket=await fetchResearchBaseline('owner','equity',report.id)
 const decision=await recordResearchRefresh({ownerId:'owner',instrument:'equity',priorPacket,packet:{...baseline,id:'new-packet',priceHistory:{latestPrice:110}} as CompanyPacket,prior:report,reason:'daily evidence check'})
 assert.equal(decision.kind,'reprice');assert.equal(writes.length,1);assert.equal(writes[0].research_note_id,'frozen-note')
 assert.equal(writes[0].classification,'reprice');assert.equal(report.id,'frozen-note');assert.equal(report.version,1)
})

test('held refresh migration falls back to the new packet without mutating historical evidence',async t=>{
 const env={url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SERVICE_ROLE_KEY}
 process.env.SUPABASE_URL='https://refresh-packet-test.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='test-key'
 t.after(()=>{process.env.SUPABASE_URL=env.url;process.env.SUPABASE_SERVICE_ROLE_KEY=env.key})
 const coverage={version:1,status:'partial',topics:[]}
 const baseline={id:'historical',symbol:'ABC',company:{cik:'issuer'},priceHistory:{latestPrice:100},sources:[],researchCoverage:coverage}
 const packet={...baseline,id:'new-packet',priceHistory:{latestPrice:110}} as unknown as CompanyPacket
 let saved:Record<string,unknown>|null=null
 t.mock.method(globalThis,'fetch',async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=new URL(String(input))
  if(url.pathname.endsWith('research_refresh_checks'))return Response.json({code:'PGRST205',message:"Could not find the table 'public.research_refresh_checks' in the schema cache"},{status:404})
  assert.ok(url.pathname.endsWith('company_packets'));assert.equal(init?.method,'PATCH');assert.equal(url.searchParams.get('id'),'eq.new-packet');assert.equal(url.searchParams.get('owner_id'),'eq.owner')
  saved=JSON.parse(String(init?.body));return Response.json([])
 })
 const decision=await recordResearchRefresh({ownerId:'owner',instrument:'equity',priorPacket:baseline,packet,prior:{id:'old-note',generatedAt:new Date().toISOString()} as EquityResearchNote,reason:'price refresh'})
 assert.equal(decision.kind,'reprice');assert.ok(saved)
 const frozen=(saved as unknown as {packet:CompanyPacket & {researchRefresh:{researchNoteId:string}}}).packet
 assert.equal(frozen.researchRefresh.researchNoteId,'old-note');assert.deepEqual(frozen.researchCoverage,coverage);assert.ok(!('researchRefresh' in baseline))
})
