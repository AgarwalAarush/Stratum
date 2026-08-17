#!/usr/bin/env node
import { backfillWorldEvents } from '../lib/server/world-events.ts'
import { runWorldThinker } from '../lib/server/world-thinker.ts'

const days = Math.max(1, Math.min(366, Number(process.env.STRATUM_WORLD_BACKFILL_DAYS ?? 365)))
const until = new Date()
const since = new Date(until.getTime() - days * 24 * 60 * 60_000)
const result = await backfillWorldEvents({
  since,
  until,
  model: process.env.STRATUM_WORLD_BACKFILL_MODEL !== 'false',
  onWeek: async (summary) => {
    process.stdout.write(`${JSON.stringify({ event: 'world_backfill_week', ...summary })}\n`)
    if (process.env.STRATUM_WORLD_BACKFILL_THINK !== 'false' && Number(summary.clusterCount ?? 0) > 0) {
      const thinker = await runWorldThinker({ trigger: 'backfill', push: false, canonicalProjection: false })
      process.stdout.write(`${JSON.stringify({ event: 'world_backfill_thinker', week: summary.week, ...thinker })}\n`)
    }
  },
})
process.stdout.write(`${JSON.stringify({ event: 'world_backfill_complete', since: since.toISOString(), until: until.toISOString(), ...result })}\n`)
