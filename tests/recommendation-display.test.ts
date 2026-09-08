import test from 'node:test'
import assert from 'node:assert/strict'
import { recommendationDisplayContext, decisionHeadline, readableDecisionText } from '../lib/markets/recommendation-display.ts'
import type { Recommendation } from '../lib/markets/recommendations.ts'
import { renderInvestmentNewsletter } from '../lib/markets/investment-newsletter.ts'

test('browser projection retains source dates and account identity without serializing raw research', () => {
  const raw = {world:[{title:'Rates',summary:'Rates changed',raw:'large'}],cutoff:'2026-09-07', policy:'p', gaps:[], universe:[],portfolio:[],
    names:[{portfolioId:'dad',portfolioName:'Dad & Aarush',symbol:'GRID',owned:true,research:{huge:'private model input'}}],
    evidence:[{id:'s1',url:'https://example.org',asOf:'2026-09-04',availableAt:'2026-09-06',value:{huge:'raw input'}}],
  }
  const result = recommendationDisplayContext({content:raw,content_hash:'original-hash'})!
  assert.equal(result.content.world[0].summary,'Rates changed')
  assert.equal(result.content_hash,'original-hash')
  assert.equal(result.content.names[0].owned,true)
  assert.equal(result.content.evidence[0].availableAt,'2026-09-06')
  assert.equal(JSON.stringify(result).includes('huge'),false)
  assert.equal(raw.names[0].research.huge,'private model input')
})

test('blocked decisions expose the unresolved issue without internal citations or inflated certainty', () => {
  const rec = {reason:'Independent review blocked action: Blocking execution defect: partial reduction supplies no target weight. [portfolio:00000000-0000-4000-8000-000000000001]',gateReasons:['Reduction must lower existing exposure; sell targets zero']} as Recommendation
  assert.match(decisionHeadline(rec),/clear, justified size/)
  assert.equal(readableDecisionText(rec.reason).includes('00000000'),false)
  assert.equal(readableDecisionText(rec.reason).includes('[portfolio:'),false)
  assert.match(decisionHeadline({...rec,gateReasons:[],reason:'Maintain existing exposure; margins remain resilient.'}),/margins remain resilient/)
})

test('newsletter omits blocked names and rejected claims from owner notifications', () => {
  const rec = {symbol:'ABC',portfolioId:'example',action:'no_trade',reason:'Unsupported forecast based on unavailable evidence.',gateReasons:['Unsupported forecast'],thesis:'Rejected draft claim',confidence:99} as Recommendation
  const rendered = renderInvestmentNewsletter({date:'2026-09-07',publishedAt:'2026-09-07T14:00:00Z',summary:'One incomplete review.',recommendations:[rec],portfolioNames:{example:'Illustrative'},worldHighlights:[],outcomes:[],gaps:[]})
  for (const output of [rendered.text,rendered.html]) {
    assert.equal(output.includes('ABC'),false)
    assert.equal(output.includes('forecast did not pass evidence review'),false)
    assert.equal(output.includes('Rejected draft claim'),false)
    assert.equal(output.includes('99%'),false)
  }
})


test('only approved unexpired capital changes appear in both email formats', async () => {
  const { isActionableCapitalChange } = await import('../lib/markets/recommendation-display.ts')
  const now = Date.parse('2026-09-07T14:00:00Z')
  const base = {portfolioId:'example',reason:'Approved change',gateReasons:[],expiresAt:'2026-09-08T14:00:00Z',thesis:'Evidence-backed <case>',counterThesis:'Demand may weaken',entry:{condition:'Within limit'},invalidation:['Margin deterioration'],reassessWhen:'Next release'} as unknown as Recommendation
  const recommendations = ['buy','add','trim','sell','hold','watch','research','no_trade'].map(action => ({...base,action,symbol:action.toUpperCase()+'ONLY'} as Recommendation))
  recommendations.push({...base,action:'buy',symbol:'BLOCKEDONLY',gateReasons:['Missing sizing']}, {...base,action:'sell',symbol:'EXPIREDONLY',expiresAt:'2026-09-06T14:00:00Z'})
  assert.equal(isActionableCapitalChange({...base,action:'buy',gateReasons:undefined} as unknown as Recommendation,now),false)
  const result=renderInvestmentNewsletter({date:'2026-09-07',asOf:new Date(now).toISOString(),publishedAt:new Date(now).toISOString(),summary:'Old noisy summary',recommendations,worldHighlights:[],outcomes:[],gaps:[]})
  for (const output of [result.text,result.html]) {
    for(const action of ['BUY','ADD','TRIM','SELL']) assert.ok(output.includes(action+'ONLY'))
    for(const action of ['HOLD','WATCH','RESEARCH','NO_TRADE','BLOCKED','EXPIRED']) assert.equal(output.includes(action+'ONLY'),false)
    assert.equal(output.includes('Old noisy summary'),false)
  }
  assert.ok(result.html.includes('&lt;case&gt;'))
})
