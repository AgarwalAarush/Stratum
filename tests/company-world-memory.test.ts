import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { sanitizeCompanyWorldFeedback, validateCompanyWorldPublication, companyFeedbackHasChanges } from '../lib/server/company-world-memory.ts'
import { buildAgentJobDedupeKey } from '../lib/server/agent-jobs.ts'
import type { WorldNode, WorldUpdateProposal } from '../lib/markets/world-thinker-types.ts'
const id='00000000-0000-4000-8000-000000000010',owner='00000000-0000-4000-8000-000000000001'
const text='The company opened its first production facility in September. Management expects further expansion in 2027.'
const note={id,symbol:'ABC',version:1,content:{formalRating:'BUY',entryAction:'buy_now',holdings:{quantity:999},sections:[{id:'business_model_and_moat',content:'A business assessment'},{id:'verdict',content:'BUY more shares'}]}}
const packet={researchCoverage:{documents:[{sourceId:'s',url:'https://issuer.example/filing',publishedAt:'2026-09-01',capturedAt:'2026-09-02',extractionStatus:'readable',text,quality:'regulatory',contentHash:'same-original'}]}}
const feedback=sanitizeCompanyWorldFeedback(note,packet,{businessSummary:'Factory producer',financialRole:{position:999}},[{source_id:'s',url:'https://issuer.example/filing',label:'Filing'}])
const node:WorldNode={id:'factory',title:'Factory capacity',kind:'theme',status:'monitoring',asOf:'2026-10-03',confidence:60,importance:80,aliases:['ABC'],relationships:[],sourceIds:[feedback.sources[0].id],nextReviewAt:'2026-11-03',summary:'Factory production',body:'Reported facility commissioning',indicators:[],claims:[{text:'The company reports facility commissioning.',sourceIds:[feedback.sources[0].id],kind:'company_statement',evidence:[{sourceId:feedback.sources[0].id,quote:'The company opened its first production facility in September.'}]}]}
const proposal:WorldUpdateProposal={asOf:'2026-10-03',trigger:'company_research',baseCommit:null,orientation:'Review complete report',eventClassifications:[],sources:[],upserts:[node],archives:[],opportunityLeads:[],journal:{title:'Factory update',summary:'Independent capture supports the company statement.',materialChanges:[],beliefChanges:[],scenarioChanges:[],newInvestigations:[],attentionIndicators:[]}}
test('ordinary/World-led reports share report dedupe, preserve frozen original evidence, exclude personal/capital fields',()=>{
 assert.equal(buildAgentJobDedupeKey('run-world-thinker',new Date(),{trigger:'company_research',researchNoteId:id}),`run-world-thinker:company-research:${id}`)
 assert.equal(buildAgentJobDedupeKey('run-world-thinker',new Date(),{trigger:'company_research',researchNoteId:id,worldOpportunityLeadId:'lead'}),`run-world-thinker:company-research:${id}`)
 const serialized=JSON.stringify(feedback);assert.ok(!serialized.includes('buy_now'));assert.ok(!serialized.includes('999'));assert.ok(!serialized.includes('BUY more'));assert.ok(serialized.includes(text))
 assert.match(feedback.sources[0].id,new RegExp(id));assert.equal(feedback.sources[0].origin,'https://issuer.example/filing')
 const recaptured=sanitizeCompanyWorldFeedback({...note,id:'another-report'}, {researchCoverage:{documents:[{...packet.researchCoverage.documents[0],contentHash:'different-capture',text:text+' Updated page footer.'}]}}, {},[{source_id:'s',url:'https://issuer.example/filing',label:'Filing'}])
 assert.equal(recaptured.sources[0].origin,feedback.sources[0].origin)
 assert.notEqual(recaptured.sources[0].id,feedback.sources[0].id)
 validateCompanyWorldPublication(proposal,feedback,[])
 const gap=sanitizeCompanyWorldFeedback(note,{}, {},[{source_id:'s',url:'https://issuer.example/filing',label:'Filing'}]);assert.equal(gap.sources.length,0);assert.match(gap.evidenceGaps[0],/unavailable/)
})
test('unsupported, mismatched, omitted and forecast evidence cannot publish; feedback cannot commission reports or capital actions',()=>{
 for(const changes of [{evidence:[]},{evidence:[{sourceId:feedback.sources[0].id,quote:'Invented supported finding without any original capture.'}]},{sourceIds:['wrong']},{kind:'forecast' as const}]){
  assert.throws(()=>validateCompanyWorldPublication({...proposal,upserts:[{...node,claims:[{...node.claims[0],...changes}]}]},feedback,[]))
 }
 assert.throws(()=>validateCompanyWorldPublication({...proposal,journal:{...proposal.journal,newInvestigations:['Research company again']}},feedback,[]),/commission/)
 assert.throws(()=>validateCompanyWorldPublication({...proposal,upserts:[{...node,body:'owner holdings increase'}]},feedback,[]),/capital/)
 assert.equal(companyFeedbackHasChanges({...proposal,upserts:[{...node,kind:'current'}]}),false)
})
test('transactional completion creates exactly one receipt; retained/retried reports, owner backfill and claim publication are idempotent',async()=>{
 const db=new PGlite()
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role;
   create table world_observations(id uuid primary key);create table agent_jobs(id uuid primary key);create table world_thinker_runs(id uuid primary key);
   create table equity_research_notes(id uuid primary key,owner_id uuid,symbol text,version integer,status text,content jsonb,data_as_of timestamptz,generated_at timestamptz);
   create function prevent_world_evidence_mutation() returns trigger language plpgsql as $$ begin raise exception 'Immutable evidence'; end $$;`)
  await db.exec(await readFile(new URL('../supabase/migrations/202610030003_world_memory_company_feedback.sql',import.meta.url),'utf8'))
  await db.query("insert into equity_research_notes values($1,$2,'ABC',1,'running',$3,'2026-01-01','2026-01-01')",[id,owner,JSON.stringify(note.content)])
  await db.exec('begin');await db.query("update equity_research_notes set status='complete' where id=$1",[id]);await db.exec('rollback')
  assert.equal((await db.query('select * from company_world_memory_receipts')).rows.length,0)
  await db.query("update equity_research_notes set status='complete' where id=$1",[id]);await db.query("update equity_research_notes set status='complete' where id=$1",[id])
  assert.equal((await db.query('select * from company_world_memory_receipts')).rows.length,1)
  const job='00000000-0000-4000-8000-000000000011';await db.query('insert into agent_jobs values($1)',[job])
  assert.equal((await db.query('select * from claim_company_world_receipt($1,$2)',[id,job])).rows.length,1)
  await db.query("update company_world_memory_receipts set status='failed' where report_id=$1",[id])
  assert.equal((await db.query('select * from claim_company_world_receipt($1,$2)',[id,job])).rows.length,1)
  for(const status of ['applied','no_change','blocked']){
   await db.query('update company_world_memory_receipts set status=$1 where report_id=$2',[status,id]);assert.equal((await db.query('select * from claim_company_world_receipt($1,$2)',[id,job])).rows.length,0)
  }
  assert.equal((await db.query("select status from equity_research_notes where id=$1",[id])).rows[0].status,'complete')
  const newer='00000000-0000-4000-8000-000000000012',other='00000000-0000-4000-8000-000000000002'
  // Simulate completed legacy versions before this release's completion trigger.
  await db.exec('alter table equity_research_notes disable trigger company_world_report_complete')
  await db.query("insert into equity_research_notes values($1,$2,'ABC',2,'complete',$3,'2026-02-01','2026-02-01')",[newer,owner,'{}'])
  await db.query("insert into equity_research_notes values(gen_random_uuid(),$1,'ABC',1,'complete','{}','2026-02-01','2026-02-01')",[other])
  await db.exec('alter table equity_research_notes enable trigger company_world_report_complete')
  await db.exec('select backfill_company_world_reports();select backfill_company_world_reports()')
  assert.equal((await db.query('select * from company_world_memory_receipts')).rows.length,3)
  const imported=(await db.query<{created_at:Date;origin:string}>('select created_at,origin from company_world_memory_receipts where report_id=$1',[newer])).rows[0]
  assert.equal(imported.origin,'backfill');assert.ok(new Date(imported.created_at).getTime()>new Date('2026-02-01').getTime())
  assert.equal((await db.query('select * from company_research_search_index where owner_id=$1',[other])).rows.length,1)
  const revisions=[{revision_id:'r1',claim_id:'c1',node_id:'factory',content:{text:'Captured fact'},sources:[],evidence_origins:['root']}]
  await db.query('select publish_world_memory_snapshot($1,$2,$3,$4)',['commit1','shadow',JSON.stringify([]),JSON.stringify(revisions)])
  await db.query('select publish_world_memory_snapshot($1,$2,$3,$4)',['commit1','shadow',JSON.stringify([]),JSON.stringify(revisions)])
  await db.query('select publish_world_memory_snapshot($1,$2,$3,$4)',['commit2','shadow',JSON.stringify([]),JSON.stringify(revisions)])
  assert.equal((await db.query('select * from world_claim_revisions')).rows.length,1)
  assert.equal((await db.query('select * from world_claim_memberships')).rows.length,2)
  await assert.rejects(db.exec("update world_claim_revisions set content='{}'"),/Immutable evidence/)
  await db.exec('grant select on company_research_search_index to authenticated;set role authenticated')
  assert.equal((await db.query('select * from company_research_search_index')).rows.length,0)
 }finally{await db.close()}
})
