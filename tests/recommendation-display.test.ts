import test from 'node:test'
import assert from 'node:assert/strict'
import { recommendationDisplayContext } from '../lib/markets/recommendation-display.ts'

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
