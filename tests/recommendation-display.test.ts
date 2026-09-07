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

test('newsletter retains blocked names without presenting rejected thesis or confidence as advice', () => {
  const rec = {symbol:'ABC',portfolioId:'example',action:'no_trade',reason:'Unsupported forecast based on unavailable evidence.',gateReasons:['Unsupported forecast'],thesis:'Rejected draft claim',confidence:99} as Recommendation
  const rendered = renderInvestmentNewsletter({date:'2026-09-07',publishedAt:'2026-09-07T14:00:00Z',summary:'One incomplete review.',recommendations:[rec],portfolioNames:{example:'Illustrative'},worldHighlights:[],outcomes:[],gaps:[]})
  for (const output of [rendered.text,rendered.html]) {
    assert.match(output,/ABC/)
    assert.match(output,/forecast did not pass evidence review/)
    assert.equal(output.includes('Rejected draft claim'),false)
    assert.equal(output.includes('99%'),false)
  }
})
