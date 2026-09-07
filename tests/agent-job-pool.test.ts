import test from 'node:test'
import assert from 'node:assert/strict'
import { AgentJobPool } from '../lib/server/agent-job-pool.ts'

test('a short job releases its slot while a long sibling remains active', async () => {
  const releases: Array<(value: boolean) => void> = []
  const pool = new AgentJobPool(() => new Promise(resolve => releases.push(resolve)))
  const first = pool.next(2)
  await Promise.resolve()
  assert.equal(releases.length, 2)
  releases[1](true)
  assert.equal(await first, 1)
  assert.equal(pool.active, 1)
  const next = pool.next(2)
  await Promise.resolve()
  assert.equal(releases.length, 3)
  assert.equal(pool.active, 2)
  releases[2](true)
  assert.equal(await next, 1)
  releases[0](true)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(pool.active, 0)
})
test('capacity is bounded and empty queue attempts allow the caller to back off', async () => {
  let calls=0
  const pool=new AgentJobPool(async()=>{calls++;return false})
  assert.equal(await pool.next(100),0)
  assert.equal(calls,4)
  assert.equal(pool.active,0)
  assert.equal(await pool.next(NaN),0)
  assert.equal(calls,5)
})
test('a sibling failure between ticks is retained and surfaced on the next tick', async () => {
  const controls: Array<{resolve: (v: boolean) => void; reject: (e: Error) => void}> = []
  const pool = new AgentJobPool(() => new Promise((resolve,reject) => controls.push({resolve,reject})))
  const first=pool.next(2)
  await Promise.resolve()
  controls[0].resolve(true)
  assert.equal(await first,1)
  controls[1].reject(new Error('late sibling failure'))
  await new Promise(resolve=>setImmediate(resolve))
  await assert.rejects(pool.next(2),/late sibling failure/)
  assert.equal(controls.length,2)
})
test('claim errors are handled, propagated and leave capacity available for retry', async () => {
  let failed=true
  const pool=new AgentJobPool(async()=>{if(failed)throw new Error('database unavailable');return true})
  await assert.rejects(pool.next(2),/database unavailable/)
  await new Promise(resolve=>setImmediate(resolve))
  assert.equal(pool.active,0)
  failed=false
  assert.equal(await pool.next(1),1)
})
