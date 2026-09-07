import test from 'node:test'
import assert from 'node:assert/strict'
import { getSupabaseClient } from '../lib/server/supabase.ts'
import { loadAuthoritativeHoldingSymbols } from '../lib/server/market-universe.ts'
import type { PortfolioAccountSummary } from '../lib/markets/types.ts'

test('market universe includes confirmed and broker-only holdings without synthetic transactions', async () => {
  process.env.SUPABASE_URL='http://127.0.0.1:54321'
  process.env.SUPABASE_SERVICE_ROLE_KEY='fixture'
  const original=globalThis.fetch
  globalThis.fetch=async () => new Response(JSON.stringify([{id:'p1',owner_id:'owner'},{id:'p2',owner_id:'owner'}]),{headers:{'Content-Type':'application/json'}})
  let reads=0
  try {
    const result=await loadAuthoritativeHoldingSymbols(getSupabaseClient()!,async owner => {
      assert.equal(owner,'owner');reads++
      return [{holdings:[{symbol:'TBILL',quantity:20},{symbol:'ABC',quantity:3}]},{holdings:[{symbol:'BROKER',quantity:2},{symbol:'ABC',quantity:1},{symbol:'EMPTY',quantity:0}]}] as PortfolioAccountSummary[]
    })
    assert.deepEqual(result,['ABC','BROKER','TBILL'])
    assert.equal(reads,1)
    await assert.rejects(loadAuthoritativeHoldingSymbols(getSupabaseClient()!,async () => {throw new Error('Capture store unavailable')}),/Capture store unavailable/)
  } finally {globalThis.fetch=original}
})
