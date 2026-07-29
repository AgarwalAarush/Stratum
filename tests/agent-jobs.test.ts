import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  agentJobProvider,
  buildAgentJobDedupeKey,
  isMissingDedupeConstraint,
  normalizeClaimedAgentJob,
  parseAgentJobType,
  shouldRefreshClosedMarket,
} from '../lib/server/agent-jobs.ts'

test('agent job parser rejects unknown work', () => {
  assert.equal(parseAgentJobType('refresh-market-screener'), 'refresh-market-screener')
  assert.throws(() => parseAgentJobType('place-order'), /Unsupported agent job type/)
})

test('five-minute market refreshes receive stable dedupe buckets', () => {
  assert.equal(
    buildAgentJobDedupeKey('refresh-market-screener', new Date('2026-07-15T14:33:42Z')),
    'refresh-market-screener:2026-07-15T14:30:00.000Z',
  )
  assert.equal(
    buildAgentJobDedupeKey('refresh-cross-asset', new Date('2026-07-15T14:33:42Z')),
    'refresh-cross-asset:2026-07-15T14:30:00.000Z',
  )
  assert.equal(
    buildAgentJobDedupeKey('generate-market-memo', new Date(), { snapshotId: 'snapshot-123' }),
    'generate-market-memo:snapshot-123',
  )
  assert.equal(
    buildAgentJobDedupeKey('refresh-fmp-intelligence', new Date('2026-07-15T14:33:42Z')),
    'refresh-fmp-intelligence:2026-07-15T14:30:00.000Z',
  )
  assert.equal(
    buildAgentJobDedupeKey('scan-research-refreshes', new Date('2026-07-15T14:33:42Z')),
    'scan-research-refreshes:2026-07-15T14:30:00.000Z',
  )
  assert.equal(
    buildAgentJobDedupeKey('event-refresh-company-research', new Date('2026-07-15T14:33:42Z'), {
      ownerId: 'owner-1',
      symbol: 'AAPL',
      eventId: 'filing-1',
    }),
    'event-refresh-company-research:owner-1:AAPL:2026-07-15:filing-1',
  )
})

test('agent jobs retain their actual data provider', () => {
  assert.equal(agentJobProvider('sync-market-assets'), 'alpaca')
  assert.equal(agentJobProvider('refresh-market-screener'), 'alpaca')
  assert.equal(agentJobProvider('prune-market-data'), 'market-data')
  assert.equal(agentJobProvider('refresh-fmp-intelligence'), 'fmp')
  assert.equal(agentJobProvider('refresh-cross-asset'), 'market-data')
  assert.equal(agentJobProvider('materialize-market-leadership'), 'market-data')
  assert.equal(agentJobProvider('run-candidate-scout'), 'fmp')
  assert.equal(agentJobProvider('generate-market-memo'), 'codex')
  assert.equal(agentJobProvider('generate-company-research'), 'codex')
  assert.equal(agentJobProvider('event-refresh-company-research'), 'codex')
  assert.equal(agentJobProvider('scan-research-refreshes'), 'market-data')
})

test('provider work respects slow off-hours dedupe buckets', () => {
  assert.equal(
    buildAgentJobDedupeKey('refresh-fmp-intelligence', new Date('2026-07-29T08:31:00Z'), {
      cadenceMinutes: 120,
    }),
    'refresh-fmp-intelligence:2026-07-29T08:00:00.000Z',
  )
  assert.equal(
    buildAgentJobDedupeKey('refresh-market-screener', new Date('2026-07-29T21:31:00Z'), {
      mode: 'daily',
    }),
    'refresh-market-screener:daily:2026-07-29',
  )
})

test('agent jobs recognize a database missing the dedupe index', () => {
  assert.equal(
    isMissingDedupeConstraint('there is no unique or exclusion constraint matching the ON CONFLICT specification'),
    true,
  )
  assert.equal(isMissingDedupeConstraint('permission denied'), false)
})

test('closed markets refresh stale publications once instead of preserving old data', () => {
  const now = new Date('2026-07-29T02:00:00Z')
  assert.equal(shouldRefreshClosedMarket(null, now), true)
  assert.equal(shouldRefreshClosedMarket({ published_at: '2026-07-28T19:59:59Z' }, now), true)
  assert.equal(shouldRefreshClosedMarket({ published_at: '2026-07-28T21:00:00Z' }, now), false)
})

test('worker startup recovers stale claimed jobs after a hard stop', async () => {
  const [agentJobsSource, workerSource] = await Promise.all([
    readFile(new URL('../lib/server/agent-jobs.ts', import.meta.url), 'utf8'),
    readFile(new URL('../scripts/markets-worker.ts', import.meta.url), 'utf8'),
  ])
  assert.match(agentJobsSource, /export async function recoverStaleAgentJobs/)
  assert.match(agentJobsSource, /45 \* 60 \* 1_000/)
  assert.match(agentJobsSource, /status: 'queued'/)
  assert.match(agentJobsSource, /Recovered after the worker stopped/)
  assert.match(workerSource, /await recoverStaleAgentJobs\(\)/)
  assert.match(workerSource, /stale_jobs_recovered/)
})

test('empty PostgREST RPC results normalize to no claimed job', () => {
  assert.equal(normalizeClaimedAgentJob([]), null)
  assert.equal(
    normalizeClaimedAgentJob([{ id: null, job_type: null, payload: null, attempts: null, max_attempts: null }]),
    null,
  )
  assert.deepEqual(
    normalizeClaimedAgentJob([{ id: 'job-123', job_type: 'sync-market-assets', payload: {}, attempts: 1, max_attempts: 3 }]),
    { id: 'job-123', job_type: 'sync-market-assets', payload: {}, attempts: 1, max_attempts: 3 },
  )
})

test('job migration adds durable deduplication', async () => {
  const sql = await readFile(new URL('../supabase/migrations/202607150002_agent_job_deduplication.sql', import.meta.url), 'utf8')
  assert.match(sql, /unique index if not exists agent_jobs_dedupe_key/i)
})
