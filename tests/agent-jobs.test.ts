import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  agentJobProvider,
  buildAgentJobDedupeKey,
  normalizeClaimedAgentJob,
  parseAgentJobType,
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
    buildAgentJobDedupeKey('generate-market-memo', new Date(), { snapshotId: 'snapshot-123' }),
    'generate-market-memo:snapshot-123',
  )
  assert.equal(
    buildAgentJobDedupeKey('refresh-fmp-intelligence', new Date('2026-07-15T14:33:42Z')),
    'refresh-fmp-intelligence:2026-07-15T14:30:00.000Z',
  )
})

test('agent jobs retain their actual data provider', () => {
  assert.equal(agentJobProvider('sync-market-assets'), 'alpaca')
  assert.equal(agentJobProvider('refresh-market-screener'), 'alpaca')
  assert.equal(agentJobProvider('refresh-fmp-intelligence'), 'fmp')
  assert.equal(agentJobProvider('generate-market-memo'), 'codex')
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
