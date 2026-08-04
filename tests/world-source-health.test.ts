import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import type { WorldSourceContract } from '../lib/markets/types.ts'
import { probeWorldSourceHealth } from '../lib/server/world-source-health.ts'

const source = { canonicalUrl: 'https://example.gov/reports/latest' }
const contract: WorldSourceContract = {
  id: 'contract-1', sourceId: 'source-1', version: 1, status: 'active', allowedHosts: ['example.gov'], allowedPaths: ['/reports'],
  acceptedMimeTypes: ['text/html', 'application/pdf'], cadence: 'daily', assertionsAllowed: ['fact'], retentionDays: null, notes: 'Test contract', createdAt: '2026-08-04T00:00:00.000Z',
}

test('source health accepts a reachable source that matches its active contract', async () => {
  const health = await probeWorldSourceHealth(source, contract, {
    fetchImpl: async () => new Response('', { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } }),
  })
  assert.equal(health.status, 'healthy')
  assert.equal(health.httpStatus, 200)
  assert.equal(health.mimeType, 'text/html')
  assert.equal(health.error, null)
})

test('source health falls back to a bounded GET when HEAD is unsupported', async () => {
  const methods: string[] = []
  const health = await probeWorldSourceHealth(source, contract, {
    fetchImpl: async (_url, init) => {
      methods.push(String(init?.method))
      return methods.length === 1
        ? new Response('', { status: 405 })
        : new Response('', { status: 200, headers: { 'content-type': 'application/pdf' } })
    },
  })
  assert.deepEqual(methods, ['HEAD', 'GET'])
  assert.equal(health.status, 'healthy')
})

test('source health preserves a failed contract shape for review instead of changing admission', async () => {
  const response = new Response('', { status: 200, headers: { 'content-type': 'application/json' } })
  Object.defineProperty(response, 'url', { value: 'https://example.gov/reports/latest' })
  const health = await probeWorldSourceHealth(source, contract, { fetchImpl: async () => response })
  assert.equal(health.status, 'failed')
  assert.match(health.error ?? '', /MIME type/)
})

test('health audit is worker-only, durable, scheduled, and never auto-blocks a source', async () => {
  const [migration, jobs, schedule, controlRoute, panel] = await Promise.all([
    readFile(new URL('../supabase/migrations/202608040006_world_source_health_checks.sql', import.meta.url), 'utf8'),
    readFile(new URL('../lib/server/agent-jobs.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/server/agent-schedule.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/markets/world-sources/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../components/markets/WorldSourceControlPanel.tsx', import.meta.url), 'utf8'),
  ])
  assert.match(migration, /world_source_health_checks/)
  assert.match(migration, /enable row level security/)
  assert.match(jobs, /'verify-world-source-health'/)
  assert.match(jobs, /auditWorldSourceHealth/)
  assert.match(schedule, /verify-world-source-health/)
  assert.match(controlRoute, /'audit-health'/)
  assert.match(panel, /Run source health audit/)
  assert.match(panel, /not an automatic source block/i)
})
