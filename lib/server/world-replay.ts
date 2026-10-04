import { getSupabaseClient } from './supabase.ts'
import { randomUUID } from 'node:crypto'
import { contentHash } from './recommendations.ts'
import { isHistoricalReconstructionRun, summarizeHistoricalReconstruction, type ReconstructionWindow } from '../markets/world-reconstruction.ts'

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
  if (active && isHistoricalReconstructionRun(active)) return normalizeReplayRun(active as ReplayRunRow)
  const until = options.until ?? (active ? new Date(active.until_at) : new Date())
  const since = options.since ?? (active ? new Date(active.since_at) : new Date(until.getTime() - 365 * 24 * 60 * 60_000))
  if (!Number.isFinite(since.getTime()) || !Number.isFinite(until.getTime()) || since >= until) throw new Error('Historical reconstruction requires an increasing, valid time range')
  const weeksTotal = Math.ceil((until.getTime() - since.getTime()) / (7 * 24 * 60 * 60_000))
  if (active) {
    const retired = await supabase.from('world_replay_runs').update({ status: 'failed', error: 'Legacy replay retired; restart with isolated historical reconstruction. Legacy counters are not reconstruction evidence.', updated_at: new Date().toISOString() }).eq('id', active.id).in('status', ['queued', 'running', 'paused'])
    if (retired.error) throw new Error(`Unable to retire legacy replay: ${retired.error.message}`)
  }
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

/** Legacy runs used live context and cannot become isolated evidence by
 * resuming their old cursor. Keep that history and start a separate run. */
export async function resumeWorldReplay(replayRunId?: string): Promise<WorldReplayRun> {
  const current = replayRunId ? await loadReplayRun(replayRunId) : (await fetchWorldReplayStatus({ includeBatches: false })).run
  if (!current) return startWorldReplay()
  if (!isHistoricalReconstructionRun(current)) return startWorldReplay({ since: new Date(current.sinceAt), until: new Date(current.untilAt) })
  if (current.status === 'completed') throw new Error('The latest historical reconstruction is already complete')
  const db = getSupabaseClient()!
  const result = await db.from('world_replay_runs').update({ status: 'queued', error: null, updated_at: new Date().toISOString() }).eq('id', current.id).select('*').single()
  if (result.error) throw new Error(`Unable to resume historical reconstruction: ${result.error.message}`)
  return normalizeReplayRun(result.data as ReplayRunRow)
}

/** Historical reconstruction reads only observations that were already ingested
 * by the cutoff. It has no access to live World/portfolio state and cannot queue
 * company work, mutate event checkpoints, or publish causal projections. */
export async function processWorldReplayStep(replayRunId: string, options: { model?: boolean; cursorAt?: string } = {}): Promise<{ replay: WorldReplayRun; complete: boolean; deferred: boolean; batchId: string | null; nextStep: string; superseded?: boolean }> {
  // The model option remains for API compatibility; reconstruction never runs a model.
  const db = getSupabaseClient()
  if (!db) throw new Error('Supabase service credentials are not configured')
  const replay = await loadReplayRun(replayRunId)
  if (!isHistoricalReconstructionRun(replay)) throw new Error('Legacy World replay must be restarted as isolated historical reconstruction')
  if (replay.status === 'completed') return { replay, complete: true, deferred: false, batchId: null, nextStep: 'complete' }
  if (options.cursorAt && Date.parse(options.cursorAt) !== Date.parse(replay.cursorAt)) return { replay, complete: false, deferred: false, batchId: null, nextStep: `reconstruct:${replay.cursorAt}`, superseded: true }
  const start = replay.cursorAt, end = new Date(Math.min(Date.parse(start) + 7 * 86400000, Date.parse(replay.untilAt))).toISOString()
  try {
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
      if (saved.error?.code === '23505') {
        const existing = await db.from('investment_reconstruction_artifacts').select('*').eq('replay_run_id', replay.id).eq('window_start', start).eq('decision_cutoff', end).single()
        if (existing.error) throw new Error(existing.error.message)
        artifact = existing.data
      } else {
        if (saved.error) throw new Error(saved.error.message)
        artifact = saved.data
      }
    }
    if (!artifact || artifact.content?.mode !== 'historical_evidence_reconstruction' || !Array.isArray(artifact.content.observations)) throw new Error('Historical reconstruction artifact is invalid')
    const count = artifact.content.observations.length
    const documents = artifact.content.observations.flatMap((observation: Record<string, unknown>) => {
      const document = observation.world_documents
      return document && typeof document === 'object' ? [document as Record<string, unknown>] : []
    })
    const batch = await db.from('world_replay_batches').upsert({ replay_run_id: replay.id, week_start: start, week_end: end, batch_index: 0,
      status: count ? 'screened' : 'documented_empty', outcome: count ? 'screened' : 'documented_empty', source_count: count, cluster_count: 0,
      event_cluster_ids: [], thinker_run_ids: [], result_commits: [], source_ids: artifact.content.observations.map((o: Record<string, unknown>) => String(o.id)),
      source_urls: [...new Set(documents.flatMap((document: Record<string, unknown>) => typeof document.canonical_url === 'string' ? [document.canonical_url] : []))],
      source_families: [...new Set(documents.flatMap((document: Record<string, unknown>) => typeof document.publisher === 'string' ? [document.publisher] : []))],
      used_deterministic_fallback: false, used_historical_gap_search: false, historical_gap_search_attempted: false,
      finished_at: new Date().toISOString(), last_progress_at: new Date().toISOString(), error: null,
    }, { onConflict: 'replay_run_id,week_start,batch_index' }).select('id').single()
    if (batch.error) throw new Error(batch.error.message)
    const windows = await db.from('world_replay_batches').select('week_start,week_end,source_count,status').eq('replay_run_id', replay.id).eq('batch_index', 0).lt('week_start', end).order('week_start')
    if (windows.error) throw new Error(windows.error.message)
    const progress = summarizeHistoricalReconstruction(replay.sinceAt, end, windows.data as ReconstructionWindow[])
    const complete = Date.parse(end) >= Date.parse(replay.untilAt)
    const updated = await db.from('world_replay_runs').update({ status: complete ? 'completed' : 'running', cursor_at: end,
      weeks_completed: progress.weeksCompleted, weeks_verified: progress.weeksVerified, weeks_projected: 0,
      weeks_uncovered: progress.weeksUncovered, sources_scanned: progress.sourcesScanned, clusters_retained: 0, search_gap_weeks: 0,
      finished_at: complete ? new Date().toISOString() : null, updated_at: new Date().toISOString(), error: null,
    }).eq('id', replay.id).eq('cursor_at', start).select('id').maybeSingle()
    if (updated.error) throw new Error(updated.error.message)
    const current = await loadReplayRun(replay.id)
    return { replay: current, complete: current.status === 'completed', deferred: false, batchId: batch.data.id, nextStep: current.status === 'completed' ? 'complete' : `reconstruct:${current.cursorAt}`, superseded: !updated.data }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await db.from('world_replay_runs').update({ status: 'failed', error: message, updated_at: new Date().toISOString() }).eq('id', replay.id).eq('cursor_at', start).neq('status', 'completed')
    throw error
  }
}

export async function fetchWorldReplayStatus(options: { includeBatches?: boolean } = {}): Promise<{ run: WorldReplayRun | null; batches: WorldReplayBatch[] }> {
  const supabase = getSupabaseClient()
  if (!supabase) return { run: null, batches: [] }
  const { data: run, error: runError } = await supabase.from('world_replay_runs').select('*').order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (runError && (runError.code === '42P01' || runError.code === 'PGRST205')) return { run: null, batches: [] }
  if (runError) throw new Error(`Unable to load world replay: ${runError.message}`)
  if (!run) return { run: null, batches: [] }
  if (options.includeBatches === false) return { run: normalizeReplayRun(run as ReplayRunRow), batches: [] }
  const { data: batches, error } = await supabase.from('world_replay_batches').select('*').eq('replay_run_id', run.id).order('week_start', { ascending: false }).limit(60)
  if (error) throw new Error(`Unable to load world replay batches: ${error.message}`)
  return {
    run: normalizeReplayRun(run as ReplayRunRow),
    batches: (batches ?? []).map((batch) => normalizeReplayBatch(batch as ReplayBatchRow)),
  }
}
