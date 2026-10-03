import test from 'node:test'
import assert from 'node:assert/strict'
import { recordResearchRefresh, fetchResearchBaseline } from '../lib/server/research-refresh.ts'
import type { CompanyPacket, EquityResearchNote } from '../lib/markets/types.ts'
import { currentResearchContract } from './fixtures/current-research-contract.ts'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
test('price-only evidence writes a refresh check without invoking a model or changing the frozen report',async t=>{
 const env={url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SERVICE_ROLE_KEY,exec:process.env.CODEX_EXECUTABLE}
 process.env.SUPABASE_URL='https://refresh-test.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='test-key';process.env.CODEX_EXECUTABLE='/missing/model-must-not-run'
 t.after(()=>{process.env.SUPABASE_URL=env.url;process.env.SUPABASE_SERVICE_ROLE_KEY=env.key;process.env.CODEX_EXECUTABLE=env.exec})
 const baseline={id:'frozen-packet',symbol:'ABC',version:1,company:{cik:'issuer'},financialStatements:{incomeQuarterly:[{date:'2026-06-30',revenue:10}]},priceHistory:{latestPrice:100},sources:[{id:'source',url:'https://issuer.example/results'}]}
 const report={id:'frozen-note',version:1,generatedAt:new Date().toISOString(),fairValue:120,...currentResearchContract('source')} as unknown as EquityResearchNote
 const writes: Array<Record<string,unknown>>=[]
 t.mock.method(globalThis,'fetch',async(input:RequestInfo|URL,init?:RequestInit)=>{
   const url=new URL(String(input)),table=url.pathname.split('/').at(-1)
   if(table==='equity_research_notes')return Response.json({company_packet_id:'frozen-packet'})
   if(table==='company_packets'){assert.equal(url.searchParams.get('id'),'eq.frozen-packet');return Response.json({packet:baseline})}
   if(init?.method==='POST'){writes.push(JSON.parse(String(init.body)));return Response.json([])}
   throw new Error(`Unexpected model or data request: ${url.hostname}`)
 })
 const priorPacket=await fetchResearchBaseline('owner','equity',report.id)
 const decision=await recordResearchRefresh({ownerId:'owner',instrument:'equity',priorPacket,packet:{...baseline,id:'new-packet',priceHistory:{latestPrice:110}} as unknown as CompanyPacket,prior:report,reason:'daily evidence check'})
 assert.equal(decision.kind,'reprice');assert.equal(writes.length,1);assert.equal(writes[0].research_note_id,'frozen-note')
 assert.equal(writes[0].classification,'reprice');assert.equal(report.id,'frozen-note');assert.equal(report.version,1)
})

test('held refresh migration falls back to the new packet without mutating historical evidence',async t=>{
 const env={url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SERVICE_ROLE_KEY}
 process.env.SUPABASE_URL='https://refresh-packet-test.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='test-key'
 t.after(()=>{process.env.SUPABASE_URL=env.url;process.env.SUPABASE_SERVICE_ROLE_KEY=env.key})
 const coverage={version:1,status:'partial',topics:[{decisive:false},{decisive:false},{decisive:false}]}
 const baseline={id:'historical',symbol:'ABC',company:{cik:'issuer'},priceHistory:{latestPrice:100},sources:[{id:'source-1'}],researchCoverage:coverage}
 const packet={...baseline,id:'new-packet',priceHistory:{latestPrice:110}} as unknown as CompanyPacket
 let saved:Record<string,unknown>|null=null
 t.mock.method(globalThis,'fetch',async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=new URL(String(input))
  if(url.pathname.endsWith('research_refresh_checks'))return Response.json({code:'PGRST205',message:"Could not find the table 'public.research_refresh_checks' in the schema cache"},{status:404})
  assert.ok(url.pathname.endsWith('company_packets'));assert.equal(init?.method,'PATCH');assert.equal(url.searchParams.get('id'),'eq.new-packet');assert.equal(url.searchParams.get('owner_id'),'eq.owner')
  saved=JSON.parse(String(init?.body));return Response.json([])
 })
 const decision=await recordResearchRefresh({ownerId:'owner',instrument:'equity',priorPacket:baseline,packet,prior:{id:'old-note',generatedAt:new Date().toISOString(),...currentResearchContract()} as unknown as EquityResearchNote,reason:'price refresh'})
 assert.equal(decision.kind,'reprice');assert.ok(saved)
 const frozen=(saved as unknown as {packet:CompanyPacket & {researchRefresh:{researchNoteId:string}}}).packet
 assert.equal(frozen.researchRefresh.researchNoteId,'old-note');assert.deepEqual(frozen.researchCoverage,coverage);assert.ok(!('researchRefresh' in baseline))
})
test('a legacy holding records a full contract upgrade even when only the market price changed',async t=>{
 const env={url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SERVICE_ROLE_KEY,exec:process.env.CODEX_EXECUTABLE}
 process.env.SUPABASE_URL='https://refresh-upgrade-test.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='test-key';process.env.CODEX_EXECUTABLE='/missing/model-must-not-run'
 t.after(()=>{process.env.SUPABASE_URL=env.url;process.env.SUPABASE_SERVICE_ROLE_KEY=env.key;process.env.CODEX_EXECUTABLE=env.exec})
 const baseline={id:'historical',symbol:'ABC',company:{cik:'issuer'},priceHistory:{latestPrice:100},sources:[]}
 let saved:Record<string,unknown>|null=null
 t.mock.method(globalThis,'fetch',async(input:RequestInfo|URL,init?:RequestInit)=>{
  assert.ok(new URL(String(input)).pathname.endsWith('research_refresh_checks'))
  assert.equal(init?.method,'POST');saved=JSON.parse(String(init?.body));return Response.json([])
 })
 const decision=await recordResearchRefresh({ownerId:'owner',instrument:'equity',priorPacket:baseline,packet:{...baseline,id:'current',priceHistory:{latestPrice:110}} as unknown as CompanyPacket,prior:{id:'legacy',generatedAt:new Date().toISOString()} as EquityResearchNote,reason:'portfolio-contract-upgrade'})
 assert.equal(decision.kind,'full_research');assert.match(decision.reasons[0],/contract 1/)
 assert.equal((saved as unknown as Record<string,unknown>).classification,'full_research')
})

test('an explicit portfolio backfill regenerates stale current-contract analysis rather than retaining its age',async t=>{
 process.env.SUPABASE_URL='https://backfill-refresh-test.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='test-key'
 const packet={id:'packet',symbol:'ABC',company:{cik:'issuer'},priceHistory:{latestPrice:100},sources:[{id:'source-1'}]} as unknown as CompanyPacket
 const report={id:'stale-current',generatedAt:'2026-01-01',...currentResearchContract()} as unknown as EquityResearchNote
 let logged:Record<string,unknown>|null=null
 t.mock.method(globalThis,'fetch',async(input:RequestInfo|URL,init?:RequestInit)=>{
  assert.ok(new URL(String(input)).pathname.endsWith('research_refresh_checks'));logged=JSON.parse(String(init?.body));return Response.json([])
 })
 const result=await recordResearchRefresh({ownerId:'owner',instrument:'equity',packet,priorPacket:packet,prior:report,reason:'portfolio-contract-upgrade'})
 assert.equal(result.kind,'full_research');assert.equal((logged as unknown as Record<string,unknown>).classification,'full_research');assert.equal(report.id,'stale-current')
})

test('supported periodic reviews log a new daily event while identical same-job retries remain idempotent',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'stratum-refresh-event-'))
 const env={PATH:process.env.PATH,SUPABASE_URL:process.env.SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY:process.env.SUPABASE_SERVICE_ROLE_KEY}
 process.env.PATH=`${directory}:${process.env.PATH}`;process.env.SUPABASE_URL='https://review-event-test.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='test-key'
 t.after(async()=>{for(const [key,value] of Object.entries(env)){if(value===undefined)delete process.env[key];else process.env[key]=value}await rm(directory,{recursive:true,force:true})})
 const supported={researchContractVersion:1,conclusion:'supported',summary:'Current primary evidence continues to support the recorded ownership conclusion.',sourceIds:['filing'],conditions:['The operating premise remains supported.'],feedbackReview:{changedConclusion:false,explanation:'No resolved forecast changed this conclusion.',sourceIds:[]},materialChange:null}
 await writeFile(join(directory,'codex'),`#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
const output = args[args.indexOf('--output-last-message') + 1];
process.stdin.resume();
process.stdin.on('end', () => fs.writeFileSync(output, JSON.stringify(${JSON.stringify(supported)})));
`,{mode:0o700})
 const packet={id:'packet',symbol:'ABC',company:{cik:'issuer'},filings:[],events:[],priceHistory:{latestPrice:100},sources:[{id:'filing',url:'https://issuer.example/results'}]} as unknown as CompanyPacket
 const prior={id:'report',generatedAt:new Date().toISOString(),...currentResearchContract('filing')} as unknown as EquityResearchNote
 const accepted=new Map<string,Record<string,unknown>>(),attempted:string[]=[]
 t.mock.method(globalThis,'fetch',async(input:RequestInfo|URL,init?:RequestInit)=>{
  assert.ok(new URL(String(input)).pathname.endsWith('research_refresh_checks'));assert.equal(init?.method,'POST')
  const row=JSON.parse(String(init?.body)),key=String(row.input_hash);attempted.push(key)
  if(accepted.has(key))return Response.json({code:'23505',message:'duplicate immutable review event'},{status:409})
  accepted.set(key,row);return Response.json([])
 })
 for(const reason of ['coverage-review:2026-10-03:overdue holding','coverage-review:2026-10-03:overdue holding','coverage-review:2026-10-04:overdue holding']){
  assert.equal((await recordResearchRefresh({ownerId:'owner',instrument:'equity',packet,priorPacket:packet,prior,reason})).kind,'revalidate')
 }
 assert.equal(accepted.size,2);assert.equal(attempted[0],attempted[1]);assert.notEqual(attempted[1],attempted[2])
 const events=[...accepted.values()].map(row=>(row.content as {coverageReviewEvent:string;readiness:string;update:{conclusion:string}}))
 assert.deepEqual(events.map(event=>event.coverageReviewEvent),['coverage-review:2026-10-03:overdue holding','coverage-review:2026-10-04:overdue holding'])
 assert.ok(events.every(event=>event.readiness==='complete' && event.update.conclusion==='supported'))
 // Ordinary price checks retain semantic deduplication and do not claim a review.
 const repriced={...packet,priceHistory:{...packet.priceHistory,latestPrice:110}}
 await recordResearchRefresh({ownerId:'owner',instrument:'equity',packet:repriced,priorPacket:packet,prior,reason:'daily price check'})
 await recordResearchRefresh({ownerId:'owner',instrument:'equity',packet:repriced,priorPacket:packet,prior,reason:'a subsequent ordinary price check'})
 assert.equal(accepted.size,3);assert.equal(attempted[3],attempted[4])
 assert.equal((accepted.get(attempted[3])!.content as {coverageReviewEvent?:string}).coverageReviewEvent,undefined)
})
