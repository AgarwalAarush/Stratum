import { getSupabaseClient } from './supabase.ts'
import { randomUUID } from 'node:crypto'
import { contentHash } from './recommendations.ts'

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

export async function startWorldReplay(options: { since?: Date; until?: Date; branch?: string } = {}): Promise<WorldReplayRun> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const { data: active, error: activeError } = await supabase.from('world_replay_runs').select('*').in('status', ['queued', 'running', 'paused']).order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (activeError) throw new Error(`Unable to inspect active world replay: ${activeError.message}`)
  if (active) return normalizeReplayRun(active as ReplayRunRow)
  const until = options.until ?? new Date()
  const since = options.since ?? new Date(until.getTime() - 365 * 24 * 60 * 60_000)
  const weeksTotal = Math.ceil((until.getTime() - since.getTime()) / (7 * 24 * 60 * 60_000))
  const { data, error } = await supabase.from('world_replay_runs').insert({ status: 'queued', branch: `reconstruction/${randomUUID()}`, since_at: since.toISOString(), until_at: until.toISOString(), cursor_at: since.toISOString(), weeks_total: weeksTotal }).select('*').single()
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

/** Historical reconstruction reads only observations that were already ingested
 * by the cutoff. It has no access to live World/portfolio state and cannot queue
 * company work, mutate event checkpoints, or publish causal projections. */
export async function processWorldReplayStep(replayRunId: string, options: { model?: boolean } = {}): Promise<{ replay: WorldReplayRun; complete: boolean; deferred: boolean; batchId: string | null; nextStep: string }> {
  void options // Retained API compatibility; reconstruction intentionally does not run a model.
  const db = getSupabaseClient()
  if (!db) throw new Error('Supabase service credentials are not configured')
  const replay = await loadReplayRun(replayRunId)
  if (replay.status === 'completed') return { replay, complete: true, deferred: false, batchId: null, nextStep: 'complete' }
  const start = replay.cursorAt, end = new Date(Math.min(Date.parse(start) + 7 * 86400000, Date.parse(replay.untilAt))).toISOString()
  const prior = await db.from('investment_reconstruction_artifacts').select('*').eq('replay_run_id', replay.id).eq('window_start', start).eq('decision_cutoff', end).maybeSingle()
  if (prior.error) throw new Error(prior.error.message)
  let artifact = prior.data
  if (!artifact) {
    const observations: Record<string, unknown>[] = []
    for (let offset = 0; ; offset += 500) {
      const response = await db.from('world_observations').select('*,world_documents!inner(id,canonical_url,publisher,published_at,ingested_at,content_hash)')
        .gte('ingested_at', start).lt('ingested_at', end).lt('world_documents.ingested_at', end).order('ingested_at').order('id').range(offset, offset + 499)
      if (response.error) throw new Error(response.error.message)
      observations.push(...response.data)
      if (response.data.length < 500) break
    }
    const content = { mode: 'historical_evidence_reconstruction', cutoff: end, observations,
      scope: 'First-known observations within this window; no live caches, portfolio, universe, web search or model hindsight are consulted.',
      limitations: 'This is not an investment backtest. Missing pre-ingestion history remains uncovered. No prior World or portfolio state is invented.',
    }
    const saved = await db.from('investment_reconstruction_artifacts').insert({ replay_run_id: replay.id, window_start: start, decision_cutoff: end, content_hash: contentHash(content), content }).select('*').single()
    if (saved.error) throw new Error(saved.error.message)
    artifact = saved.data
  }
  const count = Array.isArray(artifact.content.observations) ? artifact.content.observations.length : 0
  const batch = await db.from('world_replay_batches').upsert({ replay_run_id: replay.id, week_start: start, week_end: end, batch_index: 0,
    status: count ? 'screened' : 'documented_empty', outcome: count ? 'screened' : 'documented_empty', source_count: count, cluster_count: 0,
    event_cluster_ids: [], thinker_run_ids: [], result_commits: [], source_ids: artifact.content.observations.map((o: Record<string, unknown>) => String(o.id)),
    used_deterministic_fallback: true, used_historical_gap_search: false, historical_gap_search_attempted: false,
    finished_at: new Date().toISOString(), last_progress_at: new Date().toISOString(), error: null,
  }, { onConflict: 'replay_run_id,week_start,batch_index' }).select('id').single()
  if (batch.error) throw new Error(batch.error.message)
  const complete = Date.parse(end) >= Date.parse(replay.untilAt)
  const updated = await db.from('world_replay_runs').update({ status: complete ? 'completed' : 'running', cursor_at: end,
    weeks_completed: replay.weeksCompleted + 1, weeks_verified: replay.weeksVerified + (count ? 1 : 0), weeks_projected: replay.weeksProjected,
    weeks_uncovered: replay.weeksUncovered + (count ? 0 : 1), sources_scanned: replay.sourcesScanned + count,
    finished_at: complete ? new Date().toISOString() : null, error: null,
  }).eq('id', replay.id).eq('cursor_at', start)
  if (updated.error) throw new Error(updated.error.message)
  return { replay: await loadReplayRun(replay.id), complete, deferred: false, batchId: batch.data.id, nextStep: complete ? 'complete' : `reconstruct:${end}` }
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
