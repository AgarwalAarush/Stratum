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
  assert.equal(parseAgentJobType('refresh-company-packet'), 'refresh-company-packet')
  assert.equal(parseAgentJobType('generate-etf-research'), 'generate-etf-research')
  assert.equal(parseAgentJobType('fetch-stock-price-history'), 'fetch-stock-price-history')
  assert.equal(parseAgentJobType('scout-world-sources'), 'scout-world-sources')
  assert.equal(parseAgentJobType('verify-world-source-health'), 'verify-world-source-health')
  assert.equal(parseAgentJobType('evaluate-market-prediction'), 'evaluate-market-prediction')
  assert.throws(() => parseAgentJobType('place-order'), /Unsupported agent job type/)
})

test('five-minute market refreshes receive stable dedupe buckets', () => {
  assert.equal(
    buildAgentJobDedupeKey('refresh-market-screener', new Date('2026-07-15T14:33:42Z')),
    'refresh-market-screener:2026-07-15T14:30:00.000Z',
  )
  assert.equal(
    buildAgentJobDedupeKey('refresh-market-screener', new Date('2026-07-15T14:33:42Z'), {
      mode: 'coverage', symbol: 'CBRS',
    }),
    'refresh-market-screener:coverage:CBRS:2026-07-15',
  )
  assert.equal(
    buildAgentJobDedupeKey('refresh-company-packet', new Date('2026-07-15T14:33:42Z'), {
      ownerId: 'owner-1', symbol: 'CBRS',
    }),
    'refresh-company-packet:owner-1:CBRS:2026-07-15',
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
    buildAgentJobDedupeKey('fetch-stock-price-history', new Date('2026-07-15T14:33:42Z'), { symbol: 'cohr' }),
    'fetch-stock-price-history:COHR:2026-07-15T14:30:00.000Z',
  )
  assert.equal(
    buildAgentJobDedupeKey('scan-research-refreshes', new Date('2026-07-15T14:33:42Z')),
    'scan-research-refreshes:2026-07-15T14:30:00.000Z',
  )
  assert.equal(
    buildAgentJobDedupeKey('monitor-investment-theses', new Date('2026-07-15T14:33:42Z'), {
      cadenceMinutes: 5,
    }),
    'monitor-investment-theses:2026-07-15T14:30:00.000Z',
  )
  assert.equal(
    buildAgentJobDedupeKey('event-refresh-company-research', new Date('2026-07-15T14:33:42Z'), {
      ownerId: 'owner-1',
      symbol: 'AAPL',
      eventId: 'filing-1',
    }),
    'event-refresh-company-research:owner-1:AAPL:2026-07-15:filing-1',
  )
  assert.equal(
    buildAgentJobDedupeKey('summarize-candidate-scout', new Date('2026-07-31T21:00:00Z'), {
      weekEnding: '2026-07-31',
    }),
    'summarize-candidate-scout:2026-07-31',
  )
  assert.equal(
    buildAgentJobDedupeKey('compile-world-baseline', new Date('2026-08-03T21:03:00Z'), {
      scopeType: 'domain', scopeKey: 'ai-power',
    }),
    'compile-world-baseline:domain:ai-power:2026-08-03T21:00:00.000Z',
  )
  assert.equal(
    buildAgentJobDedupeKey('compile-world-baseline', new Date('2026-08-03T21:03:00Z'), {
      scopeType: 'domain', scopeKey: 'ai-power', evidenceFingerprint: 'observation-a-observation-b',
    }),
    'compile-world-baseline:domain:ai-power:evidence:observation-a-observation-b',
  )
  assert.equal(
    buildAgentJobDedupeKey('synthesize-market-hypotheses', new Date('2026-08-03T21:03:00Z'), {
      evidenceFingerprint: 'observation-a-observation-b',
    }),
    'synthesize-market-hypotheses::evidence:observation-a-observation-b',
  )
  assert.equal(
    buildAgentJobDedupeKey('scout-world-sources', new Date('2026-08-03T21:03:00Z'), { domainId: 'critical-materials' }),
    'scout-world-sources:critical-materials:2026-08-03',
  )
  assert.equal(
    buildAgentJobDedupeKey('verify-world-source-health', new Date('2026-08-03T21:03:00Z')),
    'verify-world-source-health:2026-08-03',
  )
  assert.equal(
    buildAgentJobDedupeKey('evaluate-market-prediction', new Date('2026-08-03T21:03:00Z'), { predictionId: 'prediction-1' }),
    'evaluate-market-prediction:prediction-1:2026-08-03',
  )
})

test('market memo jobs deduplicate by immutable screener snapshot', async () => {
  const source = await readFile(new URL('../lib/server/agent-jobs.ts', import.meta.url), 'utf8')
  assert.match(source, /await enqueueAgentJob\('generate-market-memo', \{[\s\S]*?snapshotId: snapshot\.snapshotId/)
  assert.doesNotMatch(source, /generate-market-memo:\$\{slot\.date\}:\$\{slot\.slot\}/)
})

test('agent jobs retain their actual data provider', () => {
  assert.equal(agentJobProvider('sync-market-assets'), 'alpaca')
  assert.equal(agentJobProvider('sync-robinhood-portfolio'), 'robinhood')
  assert.equal(agentJobProvider('refresh-market-screener'), 'alpaca')
  assert.equal(agentJobProvider('refresh-company-packet'), 'fmp')
  assert.equal(agentJobProvider('prune-market-data'), 'market-data')
  assert.equal(agentJobProvider('refresh-fmp-intelligence'), 'fmp')
  assert.equal(agentJobProvider('fetch-stock-price-history'), 'fmp')
  assert.equal(agentJobProvider('refresh-cross-asset'), 'market-data')
  assert.equal(agentJobProvider('materialize-market-leadership'), 'market-data')
  assert.equal(agentJobProvider('run-candidate-scout'), 'fmp')
  assert.equal(agentJobProvider('summarize-candidate-scout'), 'market-data')
  assert.equal(agentJobProvider('generate-market-memo'), 'codex')
  assert.equal(agentJobProvider('generate-company-research'), 'codex')
  assert.equal(agentJobProvider('generate-etf-research'), 'codex')
  assert.equal(agentJobProvider('event-refresh-company-research'), 'codex')
  assert.equal(agentJobProvider('scan-research-refreshes'), 'market-data')
  assert.equal(agentJobProvider('monitor-investment-theses'), 'market-data')
  assert.equal(agentJobProvider('scout-world-sources'), 'codex')
  assert.equal(agentJobProvider('verify-world-source-health'), 'market-data')
  assert.equal(agentJobProvider('triage-world-observation-proposals'), 'codex')
})

test('observation-triage work deduplicates the immutable capture set', () => {
  assert.equal(
    buildAgentJobDedupeKey('triage-world-observation-proposals', new Date('2026-08-04T00:00:00Z'), { captureIds: ['capture-b', 'capture-a'] }),
    'triage-world-observation-proposals:capture-a,capture-b',
  )
})

test('stock coverage requests refresh the materialized screener through the existing Alpaca worker', async () => {
  const source = await readFile(new URL('../app/api/markets/stocks/coverage/route.ts', import.meta.url), 'utf8')
  assert.match(source, /requestMarketCoverage\(symbol\)/)
  assert.match(source, /enqueueAgentJob\('refresh-market-screener'/)
})

test('stock-viewer hydration queues technical coverage and a CompanyPacket without synchronous page work', async () => {
  const [route, viewer, jobs] = await Promise.all([
    readFile(new URL('../app/api/markets/stocks/hydration/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../components/markets/StockViewerHydration.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../lib/server/agent-jobs.ts', import.meta.url), 'utf8'),
  ])
  assert.match(route, /requestMarketCoverage\(symbol\)/)
  assert.match(route, /hydratePacketOwnerId: user\.id/)
  assert.match(route, /enqueueAgentJob\('refresh-company-packet'/)
  assert.match(viewer, /fetch\('\/api\/markets\/stocks\/hydration'/)
  assert.match(viewer, /router\.refresh\(\)/)
  assert.match(jobs, /!clock\.isOpen && !coverageSymbol/)
  assert.match(jobs, /materializeCompanyPacket\(symbol, ownerId\)/)
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
  assert.equal(
    buildAgentJobDedupeKey('sync-robinhood-portfolio', new Date('2026-08-03T13:22:00Z'), {
      tradingDate: '2026-08-03', slot: 'open',
    }),
    'sync-robinhood-portfolio:2026-08-03:open',
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

test('Friday Scout summaries still run when no new candidates qualify', async () => {
  const source = await readFile(new URL('../lib/server/agent-jobs.ts', import.meta.url), 'utf8')
  assert.match(source, /briefs\[0\]\?\.tradingDate\s*\?\?\s*\(typeof job\.payload\.tradingDate === 'string'/)
  assert.match(source, /getUTCDay\(\) === 5/)
  assert.match(source, /'summarize-candidate-scout'/)
})
