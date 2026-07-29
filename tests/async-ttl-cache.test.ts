import test from 'node:test'
import assert from 'node:assert/strict'
import { AsyncTtlCache } from '../lib/server/async-ttl-cache.ts'

test('async TTL cache reuses values until expiry', async () => {
  let now = 1_000
  let loads = 0
  const cache = new AsyncTtlCache<string>({ now: () => now })
  const load = async () => {
    loads += 1
    return `value-${loads}`
  }

  assert.equal(await cache.get('latest', 100, load), 'value-1')
  assert.equal(await cache.get('latest', 100, load), 'value-1')
  assert.equal(loads, 1)

  now = 1_101
  assert.equal(await cache.get('latest', 100, load), 'value-2')
  assert.equal(loads, 2)
})

test('async TTL cache deduplicates concurrent loads and does not cache misses', async () => {
  let loads = 0
  let release: ((value: string | null) => void) | undefined
  const cache = new AsyncTtlCache<string>()
  const load = () => {
    loads += 1
    return new Promise<string | null>((resolve) => {
      release = resolve
    })
  }

  const first = cache.get('same-key', 100, load)
  const second = cache.get('same-key', 100, load)
  assert.equal(loads, 1)
  release?.(null)
  assert.deepEqual(await Promise.all([first, second]), [null, null])

  const next = cache.get('same-key', 100, async () => {
    loads += 1
    return 'loaded'
  })
  assert.equal(await next, 'loaded')
  assert.equal(loads, 2)
})
