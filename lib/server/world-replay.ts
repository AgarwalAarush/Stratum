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
  error: string | null
}

function normalizeReplayRun(row: ReplayRunRow): WorldReplayRun {
  return { id: row.id, status: row.status, branch: row.branch, sinceAt: row.since_at, untilAt: row.until_at, cursorAt: row.cursor_at, weeksTotal: row.weeks_total, weeksCompleted: row.weeks_completed, sourcesScanned: row.sources_scanned, clustersRetained: row.clusters_retained, searchGapWeeks: row.search_gap_weeks, error: row.error }
}

function normalizeReplayBatch(batch: ReplayBatchRow): WorldReplayBatch {
  return {
    id: String(batch.id), replayRunId: String(batch.replay_run_id), weekStart: String(batch.week_start), weekEnd: String(batch.week_end),
    batchIndex: Number(batch.batch_index), status: String(batch.status), attemptCount: Number(batch.attempt_count), sourceCount: Number(batch.source_count),
    clusterCount: Number(batch.cluster_count), eventCursor: Number(batch.event_cursor ?? 0), eventClusterIds: batch.event_cluster_ids ?? [],
    thinkerRunIds: batch.thinker_run_ids ?? [], resultCommits: batch.result_commits ?? [], usedDeterministicFallback: batch.used_deterministic_fallback === true,
    error: typeof batch.error === 'string' ? batch.error : null,
  }
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

export async function processWorldReplayStep(replayRunId: string, options: { model?: boolean } = {}): Promise<{ replay: WorldReplayRun; complete: boolean; batchId: string | null; nextStep: string }> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const replay = await loadReplayRun(replayRunId)
  if (replay.status === 'completed') return { replay, complete: true, batchId: null, nextStep: 'complete' }
  const weekStart = new Date(replay.cursorAt)
  const until = new Date(replay.untilAt)
  if (weekStart >= until) {
    await supabase.from('world_replay_runs').update({ status: 'completed', finished_at: new Date().toISOString(), error: null, updated_at: new Date().toISOString() }).eq('id', replay.id)
    return { replay: await loadReplayRun(replay.id), complete: true, batchId: null, nextStep: 'complete' }
  }
  const weekEnd = new Date(Math.min(until.getTime(), weekStart.getTime() + 7 * 24 * 60 * 60_000))
  const { data: existingBatch, error: existingBatchError } = await supabase.from('world_replay_batches').select('*').eq('replay_run_id', replay.id).eq('week_start', weekStart.toISOString()).eq('batch_index', 0).maybeSingle()
  if (existingBatchError) throw new Error(`Unable to inspect world replay batch: ${existingBatchError.message}`)
  let batch = existingBatch as ReplayBatchRow | null
  if (!batch) {
    const { data, error } = await supabase.from('world_replay_batches').insert({
      replay_run_id: replay.id, week_start: weekStart.toISOString(), week_end: weekEnd.toISOString(), batch_index: 0,
      status: 'clustering', started_at: new Date().toISOString(), error: null, updated_at: new Date().toISOString(),
    }).select('*').single()
    if (error || !data) throw new Error(`Unable to start world replay batch: ${error?.message ?? 'unknown error'}`)
    batch = data as ReplayBatchRow
  }
  await supabase.from('world_replay_runs').update({ status: 'running', started_at: replay.weeksCompleted === 0 ? new Date().toISOString() : undefined, error: null, updated_at: new Date().toISOString() }).eq('id', replay.id)
  try {
    if (!batch.event_cluster_ids?.length && batch.event_cursor === 0) {
      const window = await processWorldEventWindow({ since: weekStart, until: weekEnd, model: options.model })
      const { data: updated, error } = await supabase.from('world_replay_batches').update({
        status: 'thinking', source_count: window.sourceCount, cluster_count: window.clusterCount, event_cluster_ids: window.eventClusterIds,
        used_deterministic_fallback: window.usedDeterministicFallback, error: null, updated_at: new Date().toISOString(),
      }).eq('id', batch.id).select('*').single()
      if (error || !updated) throw new Error(`Unable to checkpoint clustered replay batch: ${error?.message ?? 'unknown error'}`)
      batch = updated as ReplayBatchRow
    }
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
        error: null, finished_at: null, updated_at: new Date().toISOString(),
      }).eq('id', batch.id)
      if (error) throw new Error(`Unable to checkpoint replay Thinker progress: ${error.message}`)
      if (hasMore) return { replay: await loadReplayRun(replay.id), complete: false, batchId: String(batch.id), nextStep: `think:${batch.event_cursor}` }
    }
    const now = new Date().toISOString()
    await supabase.from('world_replay_batches').update({ status: batch.used_deterministic_fallback ? 'fallback' : 'projected', thinker_run_ids: thinkerRunIds, result_commits: resultCommits, finished_at: now, error: null, updated_at: now }).eq('id', batch.id)
    const complete = weekEnd >= until
    await supabase.from('world_replay_runs').update({
      status: complete ? 'completed' : 'running', cursor_at: weekEnd.toISOString(), weeks_completed: replay.weeksCompleted + 1,
      sources_scanned: replay.sourcesScanned + batch.source_count, clusters_retained: replay.clustersRetained + batch.cluster_count,
      search_gap_weeks: replay.searchGapWeeks + (batch.source_count === 0 ? 1 : 0), finished_at: complete ? now : null, error: null, updated_at: now,
    }).eq('id', replay.id)
    return { replay: await loadReplayRun(replay.id), complete, batchId: String(batch.id), nextStep: complete ? 'complete' : `cluster:${weekEnd.toISOString()}` }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
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
