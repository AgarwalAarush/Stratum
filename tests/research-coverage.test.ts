import test from 'node:test'
import assert from 'node:assert/strict'
import { collectSecFilingDocuments, captureResearchDocument, validateResearchDocumentUrl } from '../lib/server/research-documents.ts'
import { collectCompanyResearchCoverage, groundCoverageTopics, validateCoverageDiscovery } from '../lib/server/company-research-coverage.ts'
import { validateCoverageReview, hasDecisiveCoverageGap, readableCompanySourceIds, type ResearchCoverage } from '../lib/markets/research-coverage.ts'
import { classifyResearchRefresh } from '../lib/markets/research-refresh.ts'
import { gateRecommendation, type DecisionContext, type Recommendation } from '../lib/markets/recommendations.ts'
import type { CompanyPacket, EquityResearchSection } from '../lib/markets/types.ts'
import type { ResearchAdvice } from '../lib/markets/research-advice.ts'

const url='https://ir.example.com/update.html'
const quote='Cybercab began production and public road testing during the quarter.'
const topics=['autonomy','energy','automotive'].map(id=>({id,title:id+' commercialization',importance:'Important to the operating and valuation case.',decisive:true,evidence:[{url,quote}],unresolvedQuestions:[]}))
const discovery={topics,sources:[{url,title:'Official quarterly update',publishedAt:'2026-07-22T00:00:00Z'}]}
const metadata={provider:'openai' as const,model:'configured-standard',durationMs:10,status:'succeeded' as const}
const packet={symbol:'TSLA',company:{companyName:'Tesla',website:'https://example.com'},filings:[],events:[],researchEvidence:[],sources:[],priceHistory:{latestPrice:350}} as unknown as CompanyPacket
const fetchHtml:typeof fetch=async()=>new Response(`<html><body>${quote.repeat(3)}</body></html>`,{headers:{'content-type':'text/html'}})

test('earnings attachment is captured when a financing 8-K is newer',async()=>{
  const filings=[{url:'https://sec.gov/financing.htm',title:'Financing',form:'8-K',publishedAt:'2026-09-29T00:00:00Z'},{url:'https://sec.gov/earnings.htm',title:'Quarterly results',form:'8-K',publishedAt:'2026-07-22T00:00:00Z'}]
  const fetchFixture:typeof fetch=async input=>{
    const u=String(input)
    return new Response(u.endsWith('financing.htm')?`<body>${'Financing agreements and credit facilities. '.repeat(8)}</body>`:u.endsWith('earnings.htm')?`<body>Item 2.02 Results of Operations and Financial Condition. ${'Quarterly financial results. '.repeat(8)}<a href="deck.htm">99.1</a></body>`:`<body>${quote.repeat(4)}</body>`,{headers:{'content-type':'text/html'}})
  }
  const captured=await collectSecFilingDocuments(filings,input=>captureResearchDocument(input,fetchFixture))
  assert.match(captured.filings[0]!.excerpt!,/Financing agreements/)
  assert.match(captured.filings[1]!.excerpt!,/Item 2.02/)
  assert.match(captured.documents.find(d=>d.url.endsWith('deck.htm'))!.text!,/Cybercab began production/)
  assert.equal(captured.documents.find(d=>d.url.endsWith('deck.htm'))!.quality,'regulatory')
})

test('document errors remain failed captures, not readable evidence',async()=>{
  const invalidPdf=await captureResearchDocument({url,sourceId:'pdf',publishedAt:null},async()=>new Response('not a PDF',{headers:{'content-type':'application/pdf'}}))
  assert.equal(invalidPdf.extractionStatus,'failed');assert.equal(invalidPdf.text,null)
  const failed=await captureResearchDocument({url,sourceId:'missing',publishedAt:null},async()=>new Response('',{status:403}))
  assert.equal(failed.extractionStatus,'failed');assert.match(failed.error!,/403/)
  for(const unsafe of ['http://example.com','https://127.0.0.1','https://[::1]','https://user:pass@example.com','https://localhost','https://example.com:3000'])assert.throws(()=>validateResearchDocumentUrl(unsafe))
})

test('preflight captures and grounds independently identified product topics',async()=>{
  const result=await collectCompanyResearchCoverage(packet,{discover:async()=>({data:validateCoverageDiscovery(discovery),metadata}),capture:input=>captureResearchDocument(input,fetchHtml)})
  assert.equal(result.status,'complete');assert.equal(result.attempts,1);assert.equal(result.topics.length,3)
  assert.equal(result.topics[0]!.quotes[0]!.quote,quote);assert.equal(result.documents[0]!.quality,'primary');assert.ok(result.documents[0]!.contentHash)
})

test('a headline and mismatched quote cannot establish commercial evidence; retry is bounded',async()=>{
  let calls=0,captures=0
  const bad={topics:topics.map(t=>({...t,evidence:[{url,quote:'Invented profitable unit economics for autonomous vehicles.'}]})),sources:discovery.sources}
  const result=await collectCompanyResearchCoverage(packet,{discover:async()=>{calls++;return {data:bad,metadata}},capture:async input=>{captures++;return captureResearchDocument(input,fetchHtml)}})
  assert.equal(calls,2);assert.equal(captures,1);assert.equal(result.status,'partial');assert.equal(result.topics[0]!.sourceIds.length,0);assert.ok(hasDecisiveCoverageGap(result))
  const headlinePacket={...packet,sources:[{id:'headline',url,label:'Cybercab launched',source:'news',asOf:'2026-09-03'}],researchEvidence:[{id:'headline',url,kind:'growth_driver' as const,title:'Cybercab launched',source:'news',publishedAt:'2026-09-03',excerpt:null,quality:'discovery' as const}]}
  assert.deepEqual(readableCompanySourceIds(headlinePacket),[])
})

test('failed discovery records explicit failure after at most one retry',async()=>{
  let calls=0
  const result=await collectCompanyResearchCoverage(packet,{discover:async()=>{calls++;throw new Error('Search unavailable')}})
  assert.equal(calls,2);assert.equal(result.status,'failed');assert.equal(result.topics.length,0);assert.equal(result.errors.length,2)
})

test('captured commercial evidence still leaves unit economics unresolved',()=>{
  const d={sourceId:'primary',url,publishedAt:null,capturedAt:'2026-10-01',extractionStatus:'readable' as const,contentHash:'hash',text:quote,error:null,quality:'primary' as const}
  const grounded=groundCoverageTopics(topics.map(t=>({...t,unresolvedQuestions:['Unit economics remain undisclosed.']})),[d])
  const coverage:ResearchCoverage={version:1,status:'partial',topics:grounded,documents:[d],attempts:1,durationMs:1,generation:[],errors:[]}
  const sections=[{id:'growth_drivers',title:'Growth',content:'Cybercab deployment is established, while profitable unit economics remain unverified.',sourceIds:['primary']}] as EquityResearchSection[]
  const review={version:1,topics:grounded.map(t=>({topicId:t.id,status:'addressed',sectionIds:['growth_drivers'],sourceIds:['primary'],investmentImplication:'Deployment reduces technical execution risk but does not establish profitable scaling.',limitations:'Unit economics are not disclosed in the captured sources.'})),actionJustifications:{hold:null,trim:null,sell:null}}
  assert.doesNotThrow(()=>validateCoverageReview(review,coverage,sections,['primary']))
  assert.throws(()=>validateCoverageReview({...review,topics:review.topics.slice(1)},coverage,sections,['primary']),/every material topic/)
  assert.throws(()=>validateCoverageReview(review,coverage,sections,['primary'],{evidenceSufficiency:{value:'sufficient'},newEntryStance:{value:'eligible'}} as ResearchAdvice),/Decisive coverage gaps/)
  assert.throws(()=>validateCoverageReview(review,coverage,sections,['primary'],{evidenceSufficiency:{value:'limited'},newEntryStance:{value:'wait'},existingPositionStance:{value:'retain'}} as ResearchAdvice),/independent coverage-gap justification/)
})

test('price-only refresh reuses coverage; product launch forces material research',()=>{
  const prior={...packet,researchCoverage:{version:1,status:'complete',topics:[]},events:[]}
  assert.equal(classifyResearchRefresh({priorPacket:prior,packet:{...prior,priceHistory:{latestPrice:340}},instrument:'equity'}).kind,'reprice')
  assert.equal(classifyResearchRefresh({priorPacket:prior,packet:{...prior,events:[{title:'Cybercab product launch and paid deployment'}]},instrument:'equity'}).kind,'full_research')
  assert.equal(classifyResearchRefresh({priorPacket:prior,packet:{...prior,researchCoverage:{version:1,status:'partial',topics:[]}},instrument:'equity'}).kind,'revalidate')
})

test('coverage gaps gate only the dependent instrument, not another company',()=>{
  const context={cutoff:'2026-10-01T00:00:00Z',gaps:[],names:[{symbol:'TSLA',portfolioId:'p',sources:['packet:tsla'],gaps:[],quote:{price:350,asOf:'2026-10-01T00:00:00Z'},owned:true},{symbol:'MSFT',portfolioId:'p',sources:['packet:msft'],gaps:[],quote:{price:400,asOf:'2026-10-01T00:00:00Z'},owned:true}],evidence:[{id:'packet:tsla',kind:'company_packet',value:{packet:{researchCoverage:{version:1,status:'failed',topics:[]}}}},{id:'packet:msft',kind:'company_packet',value:{packet:{researchCoverage:{version:1,status:'complete',topics:[{decisive:true,sourceIds:['s'],unresolvedQuestions:[]},{decisive:false},{decisive:false}]}}}}]} as unknown as DecisionContext
  const rec={symbol:'TSLA',portfolioId:'p',action:'buy',sourceIds:['packet:tsla'],entry:{targetWeightPct:2},forecasts:[],gateReasons:[]} as unknown as Recommendation
  assert.ok(gateRecommendation(rec,context).gateReasons.some(r=>r.includes('coverage')))
  const msft=gateRecommendation({...rec,symbol:'MSFT',action:'hold',entry:{...rec.entry,targetWeightPct:null}},context)
  assert.ok(!msft.gateReasons.some(r=>r.includes('coverage')))
})

function pdfFixture(text:string):Uint8Array {
  const stream=`BT /F1 12 Tf 40 700 Td (${text}) Tj ET`
  const bodies=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`]
  let pdf='%PDF-1.4\n';const offsets=[0]
  for(const [i,body] of bodies.entries()){offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${body}\nendobj\n`}
  const xref=Buffer.byteLength(pdf)
  pdf+=`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return Buffer.from(pdf)
}

test('earnings PDF attachment and EDGAR wrapper yield readable evidence',async()=>{
  const pdf=await captureResearchDocument({url:'https://sec.gov/update.pdf',sourceId:'deck',publishedAt:null},async()=>new Response(pdfFixture(quote.repeat(3)),{headers:{'content-type':'application/pdf'}}))
  assert.equal(pdf.extractionStatus,'readable');assert.match(pdf.text!,/Cybercab began production/)
  const wrapped=await captureResearchDocument({url,sourceId:'wrapped',publishedAt:null},async()=>new Response(`<DOCUMENT>metadata<TEXT><html><body>${quote.repeat(3)}</body></html></TEXT></DOCUMENT>`,{headers:{'content-type':'text/html'}}))
  assert.equal(wrapped.extractionStatus,'readable');assert.ok(!wrapped.text!.includes('metadata'))
})

test('retry exhaustion never captures more than ten additional documents',async()=>{
  let attempts=0,captures=0
  const result=await collectCompanyResearchCoverage(packet,{discover:async(_prompt,timeout)=>{
    attempts++;assert.ok(timeout <= (attempts===1?360_000:180_000))
    const sources=Array.from({length:10},(_,i)=>({url:`https://ir.example.com/${attempts}-${i}.html`,title:'Official source',publishedAt:null}))
    return {data:{topics:topics.map(t=>({...t,evidence:[{url:sources[0]!.url,quote}]})),sources},metadata}
  },capture:async input=>{captures++;return {...input,capturedAt:'2026-10-01',contentHash:null,text:null,error:'403',quality:'primary',extractionStatus:'failed',links:[]}}})
  assert.equal(attempts,2);assert.equal(captures,10);assert.equal(result.status,'partial');assert.ok(result.errors.some(e=>e.includes('budget exhausted')))
})

test('partial coverage permits an independently supported existing-position stance',()=>{
  const coverage:ResearchCoverage={version:1,status:'partial',topics:groundCoverageTopics(topics,[{sourceId:'s',url,publishedAt:null,capturedAt:'2026-10-01',contentHash:'h',text:quote,error:null,quality:'primary',extractionStatus:'readable'}]).map(t=>({...t,unresolvedQuestions:['Unit economics are undisclosed.']})),documents:[{sourceId:'s',url,publishedAt:null,capturedAt:'2026-10-01',contentHash:'h',text:quote,error:null,quality:'primary',extractionStatus:'readable'}],attempts:2,durationMs:1,generation:[],errors:[]}
  const sections=[{id:'growth_drivers',content:'Commercial progress supports retaining current exposure while economics remain unproven.',sourceIds:['s']}] as EquityResearchSection[]
  const review={version:1,topics:coverage.topics.map(t=>({topicId:t.id,status:'addressed',sectionIds:['growth_drivers'],sourceIds:['s'],investmentImplication:'Retain existing exposure with the explicit economics limitation.',limitations:'Undisclosed economics do not support increasing exposure.'})),actionJustifications:{hold:'Current commercial progress and the separately captured operating evidence support retaining exposure; the missing economics limit new risk rather than refute this particular holding case.',trim:null,sell:null}}
  assert.doesNotThrow(()=>validateCoverageReview(review,coverage,sections,['s'],{evidenceSufficiency:{value:'limited'},newEntryStance:{value:'wait'},existingPositionStance:{value:'retain'}} as ResearchAdvice))
  assert.throws(()=>validateCoverageReview({...review,topics:review.topics.map(t=>({...t,sourceIds:['headline']}))},coverage,sections,['headline']),/unreadable or unrelated/)
})
