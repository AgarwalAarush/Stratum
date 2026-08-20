import { processWorldEventWindow } from './world-events.ts'
import { getSupabaseClient } from './supabase.ts'
import { runWorldThinker } from './world-thinker.ts'
import { worldRepositoryBranch } from './world-repository.ts'

export interface WorldReplayRun {
  id: string
  status: 'queued' | 'running' | 'paused' | 'completed' | 'failed'
  branch: string
  sinceAt: string
  untilAt: string
  cursorAt: string
  weeksTotal: number
  weeksCompleted: number
  weeksVerified: number
  weeksProjected: number
  weeksUncovered: number
  sourcesScanned: number
  clustersRetained: number
  searchGapWeeks: number
  error: string | null
}

export interface WorldReplayBatch {
  id: string
  replayRunId: string
  weekStart: string
  weekEnd: string
  batchIndex: number
  status: string
  attemptCount: number
  sourceCount: number
  clusterCount: number
  eventCursor: number
  eventClusterIds: string[]
  thinkerRunIds: string[]
  resultCommits: string[]
  usedDeterministicFallback: boolean
  usedHistoricalGapSearch: boolean
  historicalGapSearchAttempted: boolean
  sourceIds: string[]
  sourceUrls: string[]
  sourceFamilies: string[]
  recoveryCount: number
  error: string | null
}

interface ReplayRunRow {
  id: string
  status: WorldReplayRun['status']
  branch: string
  since_at: string
  until_at: string
  cursor_at: string
  weeks_total: number
  weeks_completed: number
  weeks_verified?: number
  weeks_projected?: number
  weeks_uncovered?: number
  sources_scanned: number
  clusters_retained: number
  search_gap_weeks: number
  error: string | null
}

interface ReplayBatchRow {
  id: string
  replay_run_id: string
  week_start: string
  week_end: string
  batch_index: number
  status: string
  attempt_count: number
  source_count: number
  cluster_count: number
  event_cursor: number
  event_cluster_ids: string[]
  thinker_run_ids: string[]
  result_commits: string[]
  used_deterministic_fallback: boolean
  used_historical_gap_search?: boolean
  historical_gap_search_attempted?: boolean
  source_ids?: string[]
  source_urls?: string[]
  source_families?: string[]
  recovery_count?: number
  last_progress_at?: string | null
  updated_at?: string
  error: string | null
}

function normalizeReplayRun(row: ReplayRunRow): WorldReplayRun {
  return { id: row.id, status: row.status, branch: row.branch, sinceAt: row.since_at, untilAt: row.until_at, cursorAt: row.cursor_at, weeksTotal: row.weeks_total, weeksCompleted: row.weeks_completed, weeksVerified: Number(row.weeks_verified ?? 0), weeksProjected: Number(row.weeks_projected ?? 0), weeksUncovered: Number(row.weeks_uncovered ?? 0), sourcesScanned: row.sources_scanned, clustersRetained: row.clusters_retained, searchGapWeeks: row.search_gap_weeks, error: row.error }
}

function normalizeReplayBatch(batch: ReplayBatchRow): WorldReplayBatch {
  return {
    id: String(batch.id), replayRunId: String(batch.replay_run_id), weekStart: String(batch.week_start), weekEnd: String(batch.week_end),
    batchIndex: Number(batch.batch_index), status: String(batch.status), attemptCount: Number(batch.attempt_count), sourceCount: Number(batch.source_count),
    clusterCount: Number(batch.cluster_count), eventCursor: Number(batch.event_cursor ?? 0), eventClusterIds: batch.event_cluster_ids ?? [],
    thinkerRunIds: batch.thinker_run_ids ?? [], resultCommits: batch.result_commits ?? [], usedDeterministicFallback: batch.used_deterministic_fallback === true,
    usedHistoricalGapSearch: batch.used_historical_gap_search === true,
    historicalGapSearchAttempted: batch.historical_gap_search_attempted === true,
    sourceIds: batch.source_ids ?? [], sourceUrls: batch.source_urls ?? [], sourceFamilies: batch.source_families ?? [],
    recoveryCount: Number(batch.recovery_count ?? 0),
    error: typeof batch.error === 'string' ? batch.error : null,
  }
}

export function classifyWorldReplayBatchOutcome(input: { sourceCount: number; clusterCount: number; usedDeterministicFallback: boolean }): 'documented_empty' | 'screened' | 'fallback' | 'projected' {
  if (input.sourceCount === 0) return 'documented_empty'
  if (input.clusterCount === 0) return 'screened'
  return input.usedDeterministicFallback ? 'fallback' : 'projected'
}

export function isWorldThinkerBusyError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /world_thinker_runs_one_active|duplicate key value violates unique constraint.*world_thinker_runs|Unable to create World Thinker run:.*duplicate key/i.test(message)
}

async function hasActiveLiveThinkerWork(): Promise<boolean> {
  const supabase = getSupabaseClient()
  if (!supabase) return false
  const [{ data: jobs, error: jobsError }, { data: runs, error: runsError }] = await Promise.all([
    supabase.from('agent_jobs').select('id,payload,status').eq('job_type', 'run-world-thinker').in('status', ['queued', 'running']).limit(20),
    supabase.from('world_thinker_runs').select('id,trigger,status').in('status', ['orienting', 'thinking', 'criticizing', 'revising']).order('created_at', { ascending: false }).limit(5),
  ])
  if (jobsError) throw new Error(`Unable to inspect live World Thinker jobs: ${jobsError.message}`)
  if (runsError) throw new Error(`Unable to inspect active World Thinker runs: ${runsError.message}`)
  const hasLiveJob = (jobs ?? []).some((job) => {
    const payload = job.payload && typeof job.payload === 'object' ? job.payload as Record<string, unknown> : {}
    return payload.trigger !== 'backfill'
  })
  const hasLiveRun = (runs ?? []).some((run) => run.trigger !== 'backfill')
  return hasLiveJob || hasLiveRun
}

async function recoverStaleReplayBatch(batch: ReplayBatchRow, now = new Date()): Promise<ReplayBatchRow> {
  if (!['clustering', 'thinking'].includes(batch.status)) return batch
  const lastProgress = Date.parse(batch.last_progress_at ?? batch.updated_at ?? '')
  if (!Number.isFinite(lastProgress) || now.getTime() - lastProgress < 20 * 60_000) return batch
  const supabase = getSupabaseClient()
  if (!supabase) return batch
  const recoveryCount = Number(batch.recovery_count ?? 0) + 1
  const { data, error } = await supabase.from('world_replay_batches').update({
    recovery_count: recoveryCount,
    error: `Recovered stale ${batch.status} checkpoint after 20 minutes without progress.`,
    last_progress_at: now.toISOString(),
    updated_at: now.toISOString(),
  }).eq('id', batch.id).select('*').single()
  if (error || !data) throw new Error(`Unable to recover stale replay batch: ${error?.message ?? 'unknown error'}`)
  return data as ReplayBatchRow
}

export async function startWorldReplay(options: { since?: Date; until?: Date; branch?: string } = {}): Promise<WorldReplayRun> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const { data: active, error: activeError } = await supabase.from('world_replay_runs').select('*').in('status', ['queued', 'running', 'paused']).order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (activeError) throw new Error(`Unable to inspect active world replay: ${activeError.message}`)
  if (active) return normalizeReplayRun(active as ReplayRunRow)
  const until = options.until ?? new Date()
  const since = options.since ?? new Date(until.getTime() - 365 * 24 * 60 * 60_000)
  const weeksTotal = Math.ceil((until.getTime() - since.getTime()) / (7 * 24 * 60 * 60_000))
  const { data, error } = await supabase.from('world_replay_runs').insert({ status: 'queued', branch: options.branch ?? worldRepositoryBranch(), since_at: since.toISOString(), until_at: until.toISOString(), cursor_at: since.toISOString(), weeks_total: weeksTotal }).select('*').single()
  if (error || !data) throw new Error(`Unable to create world replay: ${error?.message ?? 'unknown error'}`)
  return normalizeReplayRun(data as ReplayRunRow)
}

async function loadReplayRun(id: string): Promise<WorldReplayRun> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const { data, error } = await supabase.from('world_replay_runs').select('*').eq('id', id).maybeSingle()
  if (error || !data) throw new Error(`World replay ${id} was not found`)
  return normalizeReplayRun(data as ReplayRunRow)
}

export async function processWorldReplayStep(replayRunId: string, options: { model?: boolean } = {}): Promise<{ replay: WorldReplayRun; complete: boolean; deferred: boolean; batchId: string | null; nextStep: string }> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const replay = await loadReplayRun(replayRunId)
  if (replay.status === 'completed') return { replay, complete: true, deferred: false, batchId: null, nextStep: 'complete' }
  if (await hasActiveLiveThinkerWork()) {
    await supabase.from('world_replay_runs').update({ status: 'running', error: null, updated_at: new Date().toISOString() }).eq('id', replay.id)
    return { replay: await loadReplayRun(replay.id), complete: false, deferred: true, batchId: null, nextStep: 'yield:live-thinker' }
  }
  const weekStart = new Date(replay.cursorAt)
  const until = new Date(replay.untilAt)
  if (weekStart >= until) {
    await supabase.from('world_replay_runs').update({ status: 'completed', finished_at: new Date().toISOString(), error: null, updated_at: new Date().toISOString() }).eq('id', replay.id)
    return { replay: await loadReplayRun(replay.id), complete: true, deferred: false, batchId: null, nextStep: 'complete' }
  }
  const weekEnd = new Date(Math.min(until.getTime(), weekStart.getTime() + 7 * 24 * 60 * 60_000))
  const { data: existingBatch, error: existingBatchError } = await supabase.from('world_replay_batches').select('*').eq('replay_run_id', replay.id).eq('week_start', weekStart.toISOString()).eq('batch_index', 0).maybeSingle()
  if (existingBatchError) throw new Error(`Unable to inspect world replay batch: ${existingBatchError.message}`)
  let batch = existingBatch as ReplayBatchRow | null
  if (!batch) {
    const { data, error } = await supabase.from('world_replay_batches').insert({
      replay_run_id: replay.id, week_start: weekStart.toISOString(), week_end: weekEnd.toISOString(), batch_index: 0,
      status: 'clustering', started_at: new Date().toISOString(), last_progress_at: new Date().toISOString(), error: null, updated_at: new Date().toISOString(),
    }).select('*').single()
    if (error || !data) throw new Error(`Unable to start world replay batch: ${error?.message ?? 'unknown error'}`)
    batch = data as ReplayBatchRow
  }
  batch = await recoverStaleReplayBatch(batch)
  await supabase.from('world_replay_runs').update({ status: 'running', started_at: replay.weeksCompleted === 0 ? new Date().toISOString() : undefined, error: null, updated_at: new Date().toISOString() }).eq('id', replay.id)
  try {
    if (!batch.event_cluster_ids?.length && batch.event_cursor === 0) {
      const window = await processWorldEventWindow({ since: weekStart, until: weekEnd, model: options.model })
      const { data: updated, error } = await supabase.from('world_replay_batches').update({
        status: 'thinking', source_count: window.sourceCount, cluster_count: window.clusterCount, event_cluster_ids: window.eventClusterIds,
        used_deterministic_fallback: window.usedDeterministicFallback, error: null, last_progress_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        used_historical_gap_search: window.usedHistoricalGapSearch,
        historical_gap_search_attempted: window.historicalGapSearchAttempted,
        source_ids: window.sourceIds,
        source_urls: window.sourceUrls,
        source_families: window.sourceFamilies,
      }).eq('id', batch.id).select('*').single()
      if (error || !updated) throw new Error(`Unable to checkpoint clustered replay batch: ${error?.message ?? 'unknown error'}`)
      batch = updated as ReplayBatchRow
    }
    if (await hasActiveLiveThinkerWork()) return { replay: await loadReplayRun(replay.id), complete: false, deferred: true, batchId: String(batch.id), nextStep: `yield:live-thinker:${batch.event_cursor}` }
    const thinkerRunIds = [...(batch.thinker_run_ids ?? [])]
    const resultCommits = [...(batch.result_commits ?? [])]
    const chunk = (batch.event_cluster_ids ?? []).slice(batch.event_cursor, batch.event_cursor + 12)
    if (chunk.length) {
      const result = await runWorldThinker({ trigger: 'backfill', eventClusterIds: chunk, branch: replay.branch, push: false, canonicalProjection: false })
      thinkerRunIds.push(result.runId)
      if (result.commit) resultCommits.push(result.commit)
      if (result.status === 'failed') throw new Error(`World replay Thinker run ${result.runId} failed`)
      batch.event_cursor += chunk.length
      batch.thinker_run_ids = thinkerRunIds
      batch.result_commits = resultCommits
      const hasMore = batch.event_cursor < batch.event_cluster_ids.length
      const { error } = await supabase.from('world_replay_batches').update({
        status: 'thinking', event_cursor: batch.event_cursor, thinker_run_ids: thinkerRunIds, result_commits: resultCommits,
        error: null, finished_at: null, last_progress_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq('id', batch.id)
      if (error) throw new Error(`Unable to checkpoint replay Thinker progress: ${error.message}`)
      if (hasMore) return { replay: await loadReplayRun(replay.id), complete: false, deferred: false, batchId: String(batch.id), nextStep: `think:${batch.event_cursor}` }
    }
    const now = new Date().toISOString()
    const outcome = classifyWorldReplayBatchOutcome({ sourceCount: batch.source_count, clusterCount: batch.cluster_count, usedDeterministicFallback: batch.used_deterministic_fallback })
    await supabase.from('world_replay_batches').update({ status: outcome, outcome, thinker_run_ids: thinkerRunIds, result_commits: resultCommits, finished_at: now, last_progress_at: now, error: null, updated_at: now }).eq('id', batch.id)
    const complete = weekEnd >= until
    await supabase.from('world_replay_runs').update({
      status: complete ? 'completed' : 'running', cursor_at: weekEnd.toISOString(), weeks_completed: replay.weeksCompleted + 1,
      weeks_verified: replay.weeksVerified + (batch.source_count > 0 ? 1 : 0),
      weeks_projected: replay.weeksProjected + (batch.cluster_count > 0 ? 1 : 0),
      weeks_uncovered: replay.weeksUncovered + (batch.source_count === 0 ? 1 : 0),
      sources_scanned: replay.sourcesScanned + batch.source_count, clusters_retained: replay.clustersRetained + batch.cluster_count,
      search_gap_weeks: replay.searchGapWeeks + (batch.historical_gap_search_attempted ? 1 : 0), finished_at: complete ? now : null, error: null, updated_at: now,
    }).eq('id', replay.id)
    return { replay: await loadReplayRun(replay.id), complete, deferred: false, batchId: String(batch.id), nextStep: complete ? 'complete' : `cluster:${weekEnd.toISOString()}` }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (isWorldThinkerBusyError(error)) {
      const now = new Date().toISOString()
      await Promise.all([
        supabase.from('world_replay_batches').update({
          status: 'thinking', error: 'Deferred while live World Thinker owns the single-writer slot.',
          finished_at: null, last_progress_at: now, updated_at: now,
        }).eq('id', batch.id),
        supabase.from('world_replay_runs').update({ status: 'running', error: null, updated_at: now }).eq('id', replay.id),
      ])
      return {
        replay: await loadReplayRun(replay.id), complete: false, deferred: true, batchId: String(batch.id),
        nextStep: `yield:live-thinker-race:${batch.event_cursor}`,
      }
    }
    await Promise.all([
      supabase.from('world_replay_batches').update({ status: 'failed', attempt_count: Number(batch.attempt_count ?? 0) + 1, error: message, finished_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', batch.id),
      supabase.from('world_replay_runs').update({ status: 'failed', error: message, updated_at: new Date().toISOString() }).eq('id', replay.id),
    ])
    throw error
  }
}

export async function fetchWorldReplayStatus(): Promise<{ run: WorldReplayRun | null; batches: WorldReplayBatch[] }> {
  const supabase = getSupabaseClient()
  if (!supabase) return { run: null, batches: [] }
  const { data: run, error: runError } = await supabase.from('world_replay_runs').select('*').order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (runError && (runError.code === '42P01' || runError.code === 'PGRST205')) return { run: null, batches: [] }
  if (runError) throw new Error(`Unable to load world replay: ${runError.message}`)
  if (!run) return { run: null, batches: [] }
  const { data: batches, error } = await supabase.from('world_replay_batches').select('*').eq('replay_run_id', run.id).order('week_start', { ascending: false }).limit(60)
  if (error) throw new Error(`Unable to load world replay batches: ${error.message}`)
  return {
    run: normalizeReplayRun(run as ReplayRunRow),
    batches: (batches ?? []).map((batch) => normalizeReplayBatch(batch as ReplayBatchRow)),
  }
}
