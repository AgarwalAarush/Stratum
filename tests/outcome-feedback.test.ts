import test from 'node:test'
import assert from 'node:assert/strict'
import { economicEpisodeKey, forecastCorrelationGroup } from '../lib/markets/economic-episodes.ts'
import { evaluateShadowCalibration } from '../lib/markets/shadow-policy.ts'
import { primaryResearchPacket, frozenPrimaryPacket } from '../lib/markets/frozen-primary-evidence.ts'
import { evidenceOnlyProbability } from '../lib/markets/research-baselines.ts'
import { validateFeedbackReview } from '../lib/markets/research-feedback.ts'
import { resolveNumericForecast } from '../lib/markets/investment-learning.ts'
import { outcomePriceBatch } from '../lib/server/outcome-price-batch.ts'
import type { CompanyPacket, MarketDailyBar } from '../lib/markets/types.ts'
import type { DecisionContext } from '../lib/markets/recommendations.ts'

test('economic episodes cluster reiterations and portfolios; correlated macro questions are purged',()=>{
  const f={metric:'FRED:UNRATE',observationPeriod:'2026-10-01',unit:'Percent'}
  assert.equal(economicEpisodeKey('issuerA',f),economicEpisodeKey('issuerB',f))
  assert.equal(economicEpisodeKey('issuerA',{...f,metric:'FMP:incomeQuarterly:revenue'}),economicEpisodeKey('issuerA',{...f,metric:'FMP:incomeQuarterly:revenue'}))
  assert.equal(economicEpisodeKey('issuerA',{...f,unit:undefined}),null)
  const p={question:economicEpisodeKey('A',f)!,securityId:'A',correlationGroup:forecastCorrelationGroup('A',f.metric),issuedAt:'2026-09-01',deadline:'2026-11-01',baselineProbability:.7,candidateProbability:.6,outcome:true,evaluationId:'e'}
  const assessment=evaluateShadowCalibration([p,{...p,securityId:'B',issuedAt:'2026-09-02'}, {...p,question:'different-series',correlationGroup:forecastCorrelationGroup('B','FRED:CPIAUCSL'),issuedAt:'2026-09-03'}],20)
  assert.equal(assessment.independentEpisodes,1); assert.equal(assessment.repeated,1);assert.equal(assessment.overlapping,1)
})
test('primary-only reconstruction removes embedded analysis before generation and preserves frozen originals',()=>{
  const packet={id:'p',symbol:'TSLA',generatedAt:'2026-09-30',company:{cik:'1318605'},worldOrigin:{claims:['world conclusion']},marketTheses:[{economics:'shadow prose'}],existingThesis:{rationale:'accepted belief'},outcomeFeedback:{records:[{id:'e'}]},researchEvidence:[{id:'lead',quality:'discovery'},{id:'filing',quality:'regulatory'}],sources:[{id:'lead'},{id:'filing'},{id:'feedback:e'}]} as unknown as CompanyPacket
  const before=JSON.stringify(packet), clean=primaryResearchPacket(packet) as CompanyPacket
  assert.equal(clean.worldOrigin,undefined);assert.equal(clean.marketTheses,undefined);assert.equal(clean.existingThesis,null);assert.equal(clean.outcomeFeedback,undefined)
  assert.deepEqual(clean.sources.map(s=>s.id),['filing']);assert.equal(JSON.stringify(packet),before)
  const context={cutoff:'2026-10-01',names:[{symbol:'TSLA',portfolioId:'one',sources:['p']}],evidence:[{id:'p',kind:'company_packet',availableAt:'2026-09-30',value:{packet}}]} as unknown as DecisionContext
  assert.equal(frozenPrimaryPacket(context,'TSLA','one').packet.symbol,'TSLA')
  assert.throws(()=>frozenPrimaryPacket({...context,cutoff:'2026-09-29'},'TSLA','one'),/point-in-time/)
})
test('simple evidence baseline uses exact earlier periods and units, abstaining on missing evidence',()=>{
  const packet={company:{},financialStatements:{incomeQuarterly:[{date:'2026-03-31',revenue:90,reportedCurrency:'USD'},{date:'2026-06-30',revenue:110,reportedCurrency:'USD'},{date:'2026-09-30',revenue:10000,reportedCurrency:'USD'},{date:'2026-03-31',revenue:200,reportedCurrency:'EUR'}]}} as unknown as CompanyPacket
  const q={metric:'FMP:incomeQuarterly:revenue',unit:'USD',threshold:100,operator:'gt' as const,observationPeriod:'2026-09-30'}
  assert.equal(evidenceOnlyProbability(packet,q).probability,.5)
  assert.equal(evidenceOnlyProbability(packet,{...q,unit:'EUR'}).probability,null)
  assert.equal(evidenceOnlyProbability(packet,{...q,metric:'invented'}).probability,null)
})
test('feedback review must explicitly address measured contrary evidence, and legacy forecasts stay unresolvable',()=>{
  const feedback={cutoff:'2026-10-01',coverage:'bounded',records:[{id:'e',kind:'thesis',asOf:'2026-09-30',content:{status:'disconfirmed'}}]}
  assert.throws(()=>validateFeedbackReview({changedConclusion:false,explanation:'Unchanged supported belief',sourceIds:[]},feedback),/feedback/)
  assert.equal(validateFeedbackReview({changedConclusion:true,explanation:'The decisive premise failed against the reported metric.',sourceIds:['feedback:e']},feedback).changedConclusion,true)
  assert.equal(resolveNumericForecast({metric:'revenue',operator:'gt',threshold:100,issuedAt:'2026-01-01',deadline:'2026-09-01'},[], '2026-10-01').status,'unresolvable')
})
test('outcome batching shares retrieval and persistence, preserving task endpoints and feed isolation',async()=>{
  const requests=[{symbols:['TSLA','SPY'],start:'2026-09-01',end:'2026-09-08',feed:'iex' as const,adjustment:'all' as const},{symbols:['PL','SPY'],start:'2026-09-02',end:'2026-09-15',feed:'iex' as const,adjustment:'all' as const}]
  let calls=0,saves=0
  const get=outcomePriceBatch(requests,async symbols=>{calls++;return {feed:'iex',data:symbols.flatMap(symbol=>['2026-09-03','2026-09-10'].map(tradingDate=>({symbol,tradingDate,open:100,close:110,high:111,low:99,volume:1,asOf:tradingDate} as MarketDailyBar))) }},async()=>{saves++})
  const first=await get(requests[0]), second=await get(requests[1])
  assert.equal(calls,1);assert.equal(saves,1);assert.ok(first.data.every(b=>b.tradingDate<='2026-09-08'));assert.equal(second.data.filter(b=>b.symbol==='PL').length,2)
  const wrong=outcomePriceBatch(requests,async()=>({feed:'sip',data:[]}),async()=>{})
  await assert.rejects(wrong(requests[0]),/feed/)
})

test('PL’s explicit zero-position verdict cannot be published with affirmative retain semantics',async()=>{
  const {validateResearchNarrative}=await import('../lib/markets/research-advice.ts')
  const advice={existingPositionStance:{value:'retain'}} as Parameters<typeof validateResearchNarrative>[0]
  assert.throws(()=>validateResearchNarrative(advice,'HOLD. Keep position size at 0% today pending two qualifying reports.'),/zero-position/)
  assert.doesNotThrow(()=>validateResearchNarrative(advice,'Existing holders retain exposure. New entrants should keep position size at 0% today.'))
})

test('a newly resolved old recommendation reaches later research with matched issuer provenance',async t=>{
  const oldUrl=process.env.SUPABASE_URL, oldKey=process.env.SUPABASE_SERVICE_ROLE_KEY
  process.env.SUPABASE_URL='https://feedback-test.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='fixture-key'
  t.after(()=>{process.env.SUPABASE_URL=oldUrl;process.env.SUPABASE_SERVICE_ROLE_KEY=oldKey})
  t.mock.method(globalThis,'fetch',async(input:RequestInfo|URL)=>{
    const url=new URL(String(input)), table=url.pathname.split('/').at(-1)
    if(table==='market_assets')return Response.json({alpaca_id:'stable-issuer',source_as_of:'2026-09-30'})
    if(table==='recommendation_evaluations'){
      assert.equal(url.searchParams.get('recommendation_versions.security_id'),'eq.stable-issuer')
      return Response.json(url.searchParams.get('kind')==='eq.thesis' ? [{id:'older-resolution',recommendation_id:'2025-advice',kind:'thesis',horizon:'0',as_of:'2026-09-30',content:{forecastId:'economic-question',status:'disconfirmed',forecast:{decisivePremise:true,proposition:'Revenue exceeds threshold'},observation:{value:90,unit:'USD'}}}] : [])
    }
    if(table==='equity_research_notes'||table==='etf_research_notes')return Response.json([])
    throw new Error(`Unexpected feedback request ${table}`)
  })
  const {loadResearchFeedback,feedbackSources}=await import('../lib/server/research-feedback.ts')
  const feedback=await loadResearchFeedback('owner','TSLA','2026-10-01')
  assert.equal(feedback.records[0].id,'older-resolution')
  const {researchPrompt}=await import('../lib/server/company-research.ts')
  const prompt=researchPrompt({symbol:'TSLA',outcomeFeedback:feedback,sources:feedbackSources(feedback)} as unknown as CompanyPacket,null,null,'due economic contradiction')
  assert.match(prompt,/disconfirmed/);assert.match(prompt,/older-resolution/);assert.match(prompt,/whether recorded forecast resolutions/)
})
