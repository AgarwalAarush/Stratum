import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { performance } from 'node:perf_hooks'
import { rankWorldMemory, type MemoryClaim } from '../lib/markets/world-retrieval.ts'
import { identifyWorldClaims, worldClaimRevision, worldEvidenceOrigin } from '../lib/server/world-claims.ts'
import { parseWorldNode, renderWorldNode } from '../lib/server/world-repository.ts'
import { validateWorldNode, type WorldNode } from '../lib/markets/world-thinker-types.ts'
const now='2026-10-03T12:00:00Z'
const node=(id:string,title:string,aliases:string[]=[],targets:string[]=[]):WorldNode=>({id,title,kind:'theme',status:'active',asOf:now,confidence:70,importance:80,aliases,relationships:targets.map(targetId=>({targetId,type:'depends_on',description:'Cross-domain mechanism'})),sourceIds:['s'],nextReviewAt:'2026-11-01',summary:title,body:title,claims:[],indicators:[]})
const nodes=[node('grid','Transmission capacity',['electric grid'],['chips']),node('chips','Foundry output',['NVDA','semiconductor']),node('hydro','Reservoir storage',['drought','hydrology'])]
const claim=(id:string,nodeId:string,text:string,extra:Partial<MemoryClaim['claim']>={},acceptedAt='2026-09-01T00:00:00Z'):MemoryClaim=>({claimId:id,revisionId:`r-${id}`,nodeId,nodeTitle:nodes.find(n=>n.id===nodeId)!.title,acceptedAt,claim:{text,sourceIds:['s'],kind:'observed_fact',...extra},sources:[{id:'s',url:'https://agency.example/data',title:'Original',publishedAt:'2026-08-01',claimState:'reported',stance:'supporting'}],evidenceOrigins:['original']})
const claims=[claim('capacity','grid','Grid power bottleneck restricts data center connections',{contradicts:['relief']}),claim('relief','grid','Transmission expansion reduced the constraint',{contradicts:['capacity']}),claim('fabrication','chips','Semiconductor fabrication depends on electricity availability'),claim('water','hydro','Reservoir storage limits hydropower output'),claim('old','grid','Previous capacity estimate was corrected',{},'2026-08-01'),claim('correction','grid','Revised grid capacity estimate supersedes prior value',{supersedes:['old']},'2026-10-01'),claim('future','grid','Future expansion doubles output',{},'2026-10-05'),claim('forecast','chips','Company forecasts chip demand growth',{kind:'forecast',validFrom:'2026-07-01',validTo:'2026-09-30'})]
// Frozen task definitions, not model-generated answers; preserves release-to-release comparability.
test('frozen recall benchmark compares evidence recall, counterevidence, latency and context with existing keyword/relationship baseline',async()=>{
 const benchmark=JSON.parse(await readFile(new URL('./fixtures/world-memory-benchmark.json',import.meta.url),'utf8')) as Array<{name:string;query:string;required:string[];counter?:string[];cutoff?:string;eventFrom?:string;eventTo?:string;excluded?:string[]}>
 let improved=0,baseline=0,total=0,counter=0,baselineCounter=0,counterTotal=0,context=0,baselineContext=0,latency=0,baselineLatency=0
 for(const c of benchmark){
  const started=performance.now()
  const result=rankWorldMemory({query:c.query,knowledgeCutoff:c.cutoff,eventFrom:c.eventFrom,eventTo:c.eventTo,limit:20},nodes,claims,now)
  latency+=performance.now()-started
  const found=new Set(result.map(b=>b.claimId))
  const baselineStarted=performance.now()
  const terms=c.query.toLowerCase().split(/\s+/), direct=nodes.filter(n=>[n.title,...n.aliases].some(t=>terms.some(q=>t.toLowerCase().includes(q))))
  const ids=new Set(direct.flatMap(n=>[n.id,...n.relationships.map(r=>r.targetId)]))
  for(const n of nodes)if(n.relationships.some(r=>direct.some(d=>d.id===r.targetId)))ids.add(n.id)
  const baselineClaims=claims.filter(claim=>ids.has(claim.nodeId))
  baselineLatency+=performance.now()-baselineStarted
  for(const id of c.required){assert.ok(found.has(id),`${c.name}: missing ${id}`);total++;improved++;if(ids.has(claims.find(x=>x.claimId===id)!.nodeId))baseline++}
  for(const id of c.excluded??[])assert.ok(!found.has(id),`${c.name}: leaked ${id}`)
  for(const id of c.counter??[]){counterTotal++;assert.ok(result.some(b=>b.counterevidence.some(x=>x.claimId===id)),`${c.name}: missing counter ${id}`);counter++;if(baselineClaims.some(claim=>claim.claimId===id))baselineCounter++}
  if(c.name==='abstention')assert.equal(result.length,0)
  context+=JSON.stringify(result).length
  baselineContext+=JSON.stringify({nodes:nodes.filter(n=>ids.has(n.id)),claims:baselineClaims}).length
 }
 assert.ok(improved>=baseline);assert.ok(counter>=baselineCounter);assert.ok(latency<1000)
 console.info(JSON.stringify({benchmark:'world-memory-v1',requiredEvidenceRecall:improved/total,baselineRecall:baseline/total,counterevidenceRecall:counter/counterTotal,baselineCounterevidenceRecall:baselineCounter/counterTotal,latencyMs:latency,baselineLatencyMs:baselineLatency,meanContextCharacters:Math.round(context/benchmark.length),baselineMeanContextCharacters:Math.round(baselineContext/benchmark.length)}))
})
test('duplicate origins do not accumulate corroboration and future source captures are excluded',()=>{
 const c=claim('duplicate','grid','Power constraint');c.evidenceOrigins=['original','original'];assert.equal(rankWorldMemory({query:'power'},nodes,[c],now)[0].independentEvidenceCount,1)
 c.sources[0].capturedAt='2026-10-04';assert.equal(rankWorldMemory({query:'power'},nodes,[c],now).length,0)
 assert.equal(worldEvidenceOrigin('https://www.example.com/a?utm_source=news#x'),worldEvidenceOrigin('https://example.com/a'))
})
test('claim identity and source qualifiers survive Git roundtrips and revisions are append-only identities',()=>{
 const n=identifyWorldClaims({...nodes[0],claims:[{text:'Management projects capacity growth',sourceIds:['s'],kind:'forecast',validFrom:'2026-09-01',validTo:'2027-01-01',qualifier:'Management guidance; commissioning uncertain',evidence:[{sourceId:'s',quote:'We expect capacity to grow in the next year.'}]}]})
 const parsed=parseWorldNode(renderWorldNode(n));assert.deepEqual(parsed.claims,validateWorldNode(n).claims)
 const changed={...parsed.claims[0],text:'Management revised its capacity forecast'}
 assert.equal(changed.claimId,n.claims[0].claimId);assert.notEqual(worldClaimRevision(changed),worldClaimRevision(n.claims[0]))
})
