#!/usr/bin/env node
import { enqueueAgentJob } from '../lib/server/agent-jobs.ts'
import { startWorldReplay } from '../lib/server/world-replay.ts'

const days = Math.max(1, Math.min(366, Number(process.env.STRATUM_WORLD_BACKFILL_DAYS ?? 365)))
const until = new Date()
const since = new Date(until.getTime() - days * 24 * 60 * 60_000)
const replay = await startWorldReplay({ since, until })
const job = await enqueueAgentJob('run-world-replay', {
  replayRunId: replay.id,
  cursorAt: replay.cursorAt,
  model: process.env.STRATUM_WORLD_BACKFILL_MODEL !== 'false',
}, `run-world-replay:${replay.id}:${replay.cursorAt}`)

process.stdout.write(`${JSON.stringify({ event: 'world_replay_queued', replay, job })}\n`)
