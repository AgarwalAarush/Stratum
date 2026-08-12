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

test('a market-thesis cycle runs twice daily and owns the source-to-research chain', async () => {
  const options = { worldSourceAdapters: [] }
  const preMarket = buildDueAgentJobs(new Date('2026-07-28T10:05:00Z'), options)
    .find((job) => job.jobType === 'run-market-thesis-cycle')
  const postClose = buildDueAgentJobs(new Date('2026-07-28T22:05:00Z'), options)
    .find((job) => job.jobType === 'run-market-thesis-cycle')
  const between = buildDueAgentJobs(new Date('2026-07-28T16:05:00Z'), options)
    .some((job) => job.jobType === 'run-market-thesis-cycle')
  assert.deepEqual(preMarket?.payload, { cycle: 'pre-market', cycleDate: '2026-07-28' })
  assert.deepEqual(postClose?.payload, { cycle: 'post-close', cycleDate: '2026-07-28' })
  assert.equal(between, false)
  assert.equal(preMarket && preMarket.dedupeKey, 'run-market-thesis-cycle:2026-07-28:pre-market')
  assert.equal(postClose && postClose.dedupeKey, 'run-market-thesis-cycle:2026-07-28:post-close')

  const source = await import('node:fs/promises').then(({ readFile }) => readFile(new URL('../lib/server/agent-jobs.ts', import.meta.url), 'utf8'))
  assert.match(source, /sources -> governed collection ->[\s\S]*hypotheses -> eligible analyst\/critic work/)
  assert.match(source, /runMarketResearchOrchestration\(\{ trigger: 'scheduled' \}\)/)
})

test('six-hour research bucket schedules only the market orchestrator', () => {
  const scheduled = buildDueAgentJobs(new Date('2026-08-04T04:05:00Z'), { worldSourceAdapters: [] }).map((job) => job.jobType)
  assert.equal(scheduled.includes('orchestrate-market-research'), true)
  assert.equal(scheduled.includes('refresh-market-hypothesis-research'), false)
  assert.equal(scheduled.includes('route-market-research-frontiers'), false)
  assert.equal(scheduled.includes('evaluate-market-predictions'), false)
})

test('weekly source coverage review is a bounded planner, separate from source admission', () => {
  const scheduled = buildDueAgentJobs(new Date('2026-08-02T23:05:00Z'), { worldSourceAdapters: [] })
  assert.ok(scheduled.some((job) => job.jobType === 'review-world-source-coverage'))
  const outsideWindow = buildDueAgentJobs(new Date('2026-08-02T22:05:00Z'), { worldSourceAdapters: [] })
  assert.equal(outsideWindow.some((job) => job.jobType === 'review-world-source-coverage'), false)
})

test('worker schedules weekly and semimonthly intelligence on due dates', () => {
  const monday = jobTypes('2026-07-27T14:00:00Z')
  assert.ok(monday.includes('generate-weekly-overview'))
  assert.ok(!monday.includes('generate-monthly-overview'))

  const firstOfMonth = jobTypes('2026-08-01T14:00:00Z')
  assert.ok(firstOfMonth.includes('generate-monthly-overview'))
  assert.ok(!firstOfMonth.includes('generate-weekly-overview'))
})
