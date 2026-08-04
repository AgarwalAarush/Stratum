import test from 'node:test'
import assert from 'node:assert/strict'

import { buildDueAgentJobs } from '../lib/server/agent-schedule.ts'
import { marketMemoSlot } from '../lib/markets/market-clock.ts'

function jobTypes(at: string) {
  return buildDueAgentJobs(new Date(at)).map((job) => job.jobType)
}

test('worker suppresses five-minute screener work outside the US session', () => {
  assert.deepEqual(jobTypes('2026-07-28T08:00:00Z'), [
    'sync-market-assets',
    'prune-market-data',
    'refresh-fmp-intelligence',
    'monitor-investment-theses',
  ])
  assert.equal(jobTypes('2026-08-01T15:00:00Z').includes('refresh-market-screener'), false)
  assert.equal(jobTypes('2026-07-28T14:30:00Z').includes('refresh-market-screener'), true)
})

test('cross-asset refresh runs every five minutes during the US session and once after close', () => {
  assert.equal(jobTypes('2026-07-28T14:33:00Z').filter((job) => job === 'refresh-cross-asset').length, 1)
  assert.equal(jobTypes('2026-07-28T18:58:00Z').includes('refresh-cross-asset'), true)
  assert.equal(jobTypes('2026-07-28T08:00:00Z').includes('refresh-cross-asset'), false)
  assert.equal(jobTypes('2026-07-28T21:00:00Z').includes('refresh-cross-asset'), true)
})

test('market leadership runs once after the US close and queues Candidate Scout after materialization', () => {
  assert.equal(jobTypes('2026-07-28T19:59:00Z').includes('materialize-market-leadership'), false)
  assert.equal(jobTypes('2026-07-28T20:06:00Z').includes('materialize-market-leadership'), true)
  assert.equal(jobTypes('2026-08-01T21:00:00Z').includes('materialize-market-leadership'), false)
})

test('worker does not enqueue FMP work before its credential is configured', () => {
  assert.deepEqual(
    buildDueAgentJobs(new Date('2026-07-28T08:00:00Z'), { includeFmp: false }).map((job) => job.jobType),
    ['sync-market-assets', 'prune-market-data', 'monitor-investment-theses'],
  )
})

test('worker does not enqueue scheduled Codex work when synthesis is disabled', () => {
  assert.deepEqual(
    buildDueAgentJobs(new Date('2026-07-27T14:00:00Z'), { includeCodex: false }).map((job) => job.jobType),
    ['sync-market-assets', 'refresh-market-screener', 'prune-market-data', 'refresh-fmp-intelligence', 'refresh-cross-asset', 'monitor-investment-theses'],
  )
})

test('worker schedules daily intelligence only after its UTC release time', () => {
  assert.deepEqual(jobTypes('2026-07-28T11:59:59Z'), [
    'sync-market-assets',
    'prune-market-data',
    'refresh-fmp-intelligence',
    'monitor-investment-theses',
  ])
  assert.ok(jobTypes('2026-07-28T12:00:00Z').includes('generate-morning-brief'))
})

test('FMP intelligence uses a slower cadence outside extended market hours', () => {
  const overnight = buildDueAgentJobs(new Date('2026-07-28T08:31:00Z'))
    .find((job) => job.jobType === 'refresh-fmp-intelligence')
  const session = buildDueAgentJobs(new Date('2026-07-28T15:31:00Z'))
    .find((job) => job.jobType === 'refresh-fmp-intelligence')
  assert.equal(overnight?.payload.cadenceMinutes, 120)
  assert.equal(session?.payload.cadenceMinutes, 15)
})

test('thesis monitoring follows prices every five minutes and slows down off-hours', () => {
  const session = buildDueAgentJobs(new Date('2026-07-28T15:31:00Z'))
    .find((job) => job.jobType === 'monitor-investment-theses')
  const overnight = buildDueAgentJobs(new Date('2026-07-28T08:31:00Z'))
    .find((job) => job.jobType === 'monitor-investment-theses')
  assert.equal(session?.payload.cadenceMinutes, 5)
  assert.equal(overnight?.payload.cadenceMinutes, 120)
})

test('market synthesis has only open, midday, and close slots', () => {
  assert.deepEqual(marketMemoSlot(new Date('2026-07-28T14:03:00Z')), {
    date: '2026-07-28',
    slot: 'open',
  })
  assert.deepEqual(marketMemoSlot(new Date('2026-07-28T17:04:00Z')), {
    date: '2026-07-28',
    slot: 'midday',
  })
  assert.deepEqual(marketMemoSlot(new Date('2026-07-28T19:58:00Z')), {
    date: '2026-07-28',
    slot: 'close',
  })
  assert.equal(marketMemoSlot(new Date('2026-07-28T16:00:00Z')), null)
})

test('world-source health checks are scheduled before the daily source packet', async () => {
  const source = await import('node:fs/promises').then(({ readFile }) => readFile(new URL('../lib/server/agent-schedule.ts', import.meta.url), 'utf8'))
  assert.match(source, /newYork\.hour === 16/)
  assert.match(source, /'verify-world-source-health'/)
  assert.match(source, /newYork\.hour === 17/)
})

test('active-domain source adapters schedule by declared cadence', () => {
  const adapters = [
    { id: 'daily-domain', cadence: 'daily' as const },
    { id: 'weekly-domain', cadence: 'weekly' as const },
  ]
  const weekday = buildDueAgentJobs(new Date('2026-07-28T21:05:00Z'), { worldSourceAdapters: adapters })
    .filter((job) => job.jobType === 'ingest-world-source')
  assert.deepEqual(weekday.map((job) => job.payload.adapterId), ['daily-domain'])

  const sunday = buildDueAgentJobs(new Date('2026-08-02T21:05:00Z'), { worldSourceAdapters: adapters })
    .filter((job) => job.jobType === 'ingest-world-source')
  assert.deepEqual(sunday.map((job) => job.payload.adapterId), ['daily-domain', 'weekly-domain'])

  const none = buildDueAgentJobs(new Date('2026-07-28T21:05:00Z'), { worldSourceAdapters: [] })
    .filter((job) => job.jobType === 'ingest-world-source')
  assert.deepEqual(none, [])
})

test('worker schedules weekly and semimonthly intelligence on due dates', () => {
  const monday = jobTypes('2026-07-27T14:00:00Z')
  assert.ok(monday.includes('generate-weekly-overview'))
  assert.ok(!monday.includes('generate-monthly-overview'))

  const firstOfMonth = jobTypes('2026-08-01T14:00:00Z')
  assert.ok(firstOfMonth.includes('generate-monthly-overview'))
  assert.ok(!firstOfMonth.includes('generate-weekly-overview'))
})
