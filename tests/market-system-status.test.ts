import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('private system status exposes measured provider usage and enforced headroom', async () => {
  const [page, status, shell, worker, migration] = await Promise.all([
    readFile(new URL('../app/markets/system/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../lib/server/market-system-status.ts', import.meta.url), 'utf8'),
    readFile(new URL('../components/markets/MarketsShell.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../scripts/markets-worker.ts', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/202607300002_worker_heartbeats.sql', import.meta.url), 'utf8'),
  ])
  assert.match(page, /requireAllowedMarketUser/)
  assert.match(page, /System status/)
  assert.match(page, /Provider headroom/)
  assert.match(status, /FMP_PLAN_REQUESTS_PER_MINUTE = 300/)
  assert.match(status, /FMP_INTERNAL_REQUESTS_PER_MINUTE = 240/)
  assert.match(status, /FMP_TRAILING_BANDWIDTH_BYTES = 20/)
  assert.match(status, /providerUsage/)
  assert.match(status, /loadLatestWorkerHeartbeat/)
  assert.match(status, /loadAgentJobs/)
  assert.match(status, /job\.status === 'failed'/)
  assert.match(status, /lastSeenAt/)
  assert.match(worker, /recordWorkerHeartbeat/)
  assert.match(worker, /HEARTBEAT_INTERVAL_MS/)
  assert.match(migration, /worker_heartbeats/)
  assert.match(shell, /href="\/markets\/system"/)
})
