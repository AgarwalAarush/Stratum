import test from 'node:test'
import assert from 'node:assert/strict'
import { JsonRequestError, requestJson } from '../lib/client/request-json.ts'

test('JSON requests preserve options and encode a mutation exactly once', async (context) => {
  const fetch = context.mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
    assert.equal(url, '/api/portfolio')
    assert.equal(options.method, 'POST')
    assert.equal(options.credentials, 'same-origin')
    assert.equal(options.body, '{"action":"record","quantity":2}')
    const headers = new Headers(options.headers)
    assert.equal(headers.get('Content-Type'), 'application/json')
    assert.equal(headers.get('X-Request-ID'), 'reviewed-request')
    return Response.json({ transactionId: 'recorded' })
  })
  const result = await requestJson<{ transactionId: string }>('/api/portfolio', {
    method: 'POST', body: { action: 'record', quantity: 2 },
    credentials: 'same-origin', headers: { 'X-Request-ID': 'reviewed-request' },
  })
  assert.deepEqual(result, { transactionId: 'recorded' })
  assert.equal(fetch.mock.callCount(), 1)
})

test('HTTP failures retain endpoint messages and status without retrying writes', async (context) => {
  const fetch = context.mock.method(globalThis, 'fetch', async () => Response.json({ error: 'Review is required' }, { status: 409 }))
  await assert.rejects(requestJson('/api/portfolio', { method: 'POST', body: { action: 'record' } }), (error: unknown) => {
    assert.ok(error instanceof JsonRequestError)
    assert.equal(error.message, 'Review is required')
    assert.equal(error.status, 409)
    return true
  })
  assert.equal(fetch.mock.callCount(), 1)
  fetch.mock.mockImplementation(async () => Response.json({ error: { message: 'Invalid filter' } }, { status: 400 }))
  await assert.rejects(requestJson('/api/screener'), /Invalid filter/)
})

test('unreadable HTTP errors use the supplied fallback and do not expose HTML', async (context) => {
  context.mock.method(globalThis, 'fetch', async () => new Response('<html>upstream unavailable</html>', { status: 502 }))
  await assert.rejects(requestJson('/api/portfolio', { errorMessage: 'Portfolio could not be loaded' }), (error: unknown) => {
    assert.ok(error instanceof JsonRequestError)
    assert.equal(error.message, 'Portfolio could not be loaded')
    assert.equal(error.status, 502)
    return true
  })
})

test('an invalid successful JSON response rejects rather than returning an invented result', async (context) => {
  context.mock.method(globalThis, 'fetch', async () => new Response('not JSON'))
  await assert.rejects(requestJson('/api/portfolio'), /unreadable response/)
})

test('network rejection uses contextual feedback and never retries a mutation', async (context) => {
  const cause = new TypeError('Failed to fetch')
  const fetch = context.mock.method(globalThis, 'fetch', async () => { throw cause })
  await assert.rejects(requestJson('/api/portfolio', {
    method: 'POST', body: { action: 'record' }, errorMessage: 'Portfolio update could not be recorded',
  }), (error: unknown) => {
    assert.ok(error instanceof JsonRequestError)
    assert.equal(error.message, 'Portfolio update could not be recorded')
    assert.equal(error.cause, cause)
    return true
  })
  assert.equal(fetch.mock.callCount(), 1)
})

test('successful requests release their timer and caller cancellation listener', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  const caller = new AbortController()
  const removeListener = context.mock.method(caller.signal, 'removeEventListener')
  let requestSignal: AbortSignal | null = null
  context.mock.method(globalThis, 'fetch', async (_url: string, options: RequestInit) => {
    requestSignal = options.signal ?? null
    return Response.json({ saved: true })
  })
  await requestJson('/api/portfolio', { signal: caller.signal })
  assert.equal(removeListener.mock.callCount(), 1)
  context.mock.timers.tick(30_000)
  caller.abort()
  assert.ok(requestSignal)
  assert.equal((requestSignal as AbortSignal).aborted, false)
})

test('caller cancellation is preserved and cleans up without retrying', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  const caller = new AbortController()
  const removeListener = context.mock.method(caller.signal, 'removeEventListener')
  const clearTimer = context.mock.method(globalThis, 'clearTimeout')
  const fetch = context.mock.method(globalThis, 'fetch', (_url: string, options: RequestInit) => new Promise<Response>((_resolve, reject) => {
    options.signal?.addEventListener('abort', () => reject(options.signal?.reason), { once: true })
  }))
  const result = requestJson('/api/portfolio', { method: 'POST', body: { action: 'record' }, signal: caller.signal })
  const reason = new DOMException('Closed the view', 'AbortError')
  caller.abort(reason)
  await assert.rejects(result, (error: unknown) => error === reason)
  assert.equal(removeListener.mock.callCount(), 1)
  assert.equal(clearTimer.mock.callCount(), 1)
  assert.equal(fetch.mock.callCount(), 1)
})

test('an already canceled request never starts a fetch or timer', async (context) => {
  const caller = new AbortController()
  caller.abort()
  const fetch = context.mock.method(globalThis, 'fetch', async () => Response.json({}))
  const timer = context.mock.method(globalThis, 'setTimeout')
  await assert.rejects(requestJson('/api/portfolio', { signal: caller.signal }), { name: 'AbortError' })
  assert.equal(fetch.mock.callCount(), 0)
  assert.equal(timer.mock.callCount(), 0)
})

test('timeout covers body parsing and leaves a mutation outcome explicitly uncertain', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  const caller = new AbortController()
  const removeListener = context.mock.method(caller.signal, 'removeEventListener')
  const clearTimer = context.mock.method(globalThis, 'clearTimeout')
  const fetch = context.mock.method(globalThis, 'fetch', async (_url: string, options: RequestInit) => {
    const response = Response.json({})
    context.mock.method(response, 'json', () => new Promise((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(options.signal?.reason), { once: true })
    }))
    return response
  })
  const result = requestJson('/api/portfolio', { method: 'POST', body: { action: 'record' }, timeoutMs: 25, signal: caller.signal })
  await Promise.resolve()
  context.mock.timers.tick(25)
  await assert.rejects(result, /Refresh to check whether the update completed/)
  assert.equal(removeListener.mock.callCount(), 1)
  assert.equal(clearTimer.mock.callCount(), 1)
  assert.equal(fetch.mock.callCount(), 1)
})
