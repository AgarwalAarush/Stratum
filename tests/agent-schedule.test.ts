import test from 'node:test'
import assert from 'node:assert/strict'

import { buildDueAgentJobs } from '../lib/server/agent-schedule.ts'

function jobTypes(at: string) {
  return buildDueAgentJobs(new Date(at)).map((job) => job.jobType)
}

test('worker always schedules Alpaca and FMP ingestion', () => {
  assert.deepEqual(jobTypes('2026-07-28T08:00:00Z'), [
    'sync-market-assets',
    'refresh-market-screener',
    'refresh-fmp-intelligence',
  ])
})

test('worker does not enqueue FMP work before its credential is configured', () => {
  assert.deepEqual(
    buildDueAgentJobs(new Date('2026-07-28T08:00:00Z'), { includeFmp: false }).map((job) => job.jobType),
    ['sync-market-assets', 'refresh-market-screener'],
  )
})

test('worker schedules daily intelligence only after its UTC release time', () => {
  assert.deepEqual(jobTypes('2026-07-28T11:59:59Z'), [
    'sync-market-assets',
    'refresh-market-screener',
    'refresh-fmp-intelligence',
  ])
  assert.ok(jobTypes('2026-07-28T12:00:00Z').includes('generate-morning-brief'))
})

test('worker schedules weekly and semimonthly intelligence on due dates', () => {
  const monday = jobTypes('2026-07-27T14:00:00Z')
  assert.ok(monday.includes('generate-weekly-overview'))
  assert.ok(!monday.includes('generate-monthly-overview'))

  const firstOfMonth = jobTypes('2026-08-01T14:00:00Z')
  assert.ok(firstOfMonth.includes('generate-monthly-overview'))
  assert.ok(!firstOfMonth.includes('generate-weekly-overview'))
})
