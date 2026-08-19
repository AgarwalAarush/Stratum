import { execFile as execFileCallback } from 'node:child_process'
import { promisify } from 'node:util'
import type { WorldNode, WorldOpportunityLead, WorldSourceReference } from '../markets/world-thinker-types.ts'
import type { WorldCoverageFrontier } from '../markets/world-coverage.ts'
import { parseWorldNode, worldRepositoryBranch, worldRepositoryRoot } from './world-repository.ts'
import { getSupabaseClient } from './supabase.ts'
import { loadWorldCoverageFrontiers } from './world-coverage.ts'
import type { WorldReplayBatch, WorldReplayRun } from './world-replay.ts'

const execFile = promisify(execFileCallback)

async function git(root: string, args: string[]): Promise<string> {
  const { stdout } = await execFile('git', ['-C', root, ...args], { maxBuffer: 12 * 1024 * 1024 })
  return stdout.trim()
}

async function readCommitFile(root: string, commit: string, path: string): Promise<string> {
  return git(root, ['show', `${commit}:${path}`])
}

export async function readWorldCommit(root: string, commit: string): Promise<{
  nodes: Array<{ path: string; node: WorldNode }>
  sources: WorldSourceReference[]
  leads: WorldOpportunityLead[]
}> {
  const paths = (await git(root, ['ls-tree', '-r', '--name-only', commit, 'world'])).split('\n').filter(Boolean)
  const nodes: Array<{ path: string; node: WorldNode }> = []
  for (const path of paths.filter((path) => path.endsWith('.md') && !path.startsWith('world/index/'))) {
    try { nodes.push({ path, node: parseWorldNode(await readCommitFile(root, commit, path)) }) } catch { /* ignore non-node forward-compatible files */ }
  }
  const parseIndex = async <T>(path: string): Promise<T[]> => {
    try {
      const value = JSON.parse(await readCommitFile(root, commit, path))
      return Array.isArray(value) ? value as T[] : []
    } catch { return [] }
  }
  return { nodes, sources: await parseIndex<WorldSourceReference>('world/index/sources.json'), leads: await parseIndex<WorldOpportunityLead>('world/index/opportunity-leads.json') }
}

export async function projectWorldRepository(options: { root?: string; commit?: string; branch?: string; canonical?: boolean } = {}): Promise<{ commit: string; fileCount: number; idempotent: boolean }> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const root = options.root ?? worldRepositoryRoot()
  const branch = options.branch ?? worldRepositoryBranch()
  const commit = options.commit ?? await git(root, ['rev-parse', branch])
  const { data: existing, error: existingError } = await supabase.from('world_repository_projections').select('commit_sha,file_count').eq('commit_sha', commit).maybeSingle()
  if (existingError) throw new Error(`Unable to inspect world projection: ${existingError.message}`)
  if (existing) return { commit, fileCount: Number(existing.file_count), idempotent: true }
  const snapshot = await readWorldCommit(root, commit)
  const rows = snapshot.nodes.map(({ path, node }) => ({
    commit_sha: commit, file_path: path, node_id: node.id, kind: node.kind, status: node.status, title: node.title, as_of: node.asOf,
    next_review_at: node.nextReviewAt, confidence: node.confidence, importance: node.importance, summary: node.summary, aliases: node.aliases,
    relationships: node.relationships, source_ids: node.sourceIds, structured_content: node,
    search_text: [node.title, node.summary, node.body, node.aliases.join(' ')].join('\n').slice(0, 50_000),
  }))
  if (rows.length > 0) {
    const { error } = await supabase.from('world_file_index').upsert(rows, { onConflict: 'commit_sha,file_path' })
    if (error) throw new Error(`Unable to project world files: ${error.message}`)
  }
  if (snapshot.leads.length > 0) {
    const leadRows = snapshot.leads.map((lead) => ({
      id: lead.id, world_commit: commit, originating_node_id: lead.originatingNodeId, originating_hypothesis_id: lead.originatingHypothesisId,
      symbol: lead.symbol, issuer: lead.issuer, value_chain_role: lead.valueChainRole, what_changed: lead.whatChanged, why_now: lead.whyNow,
      transmission_mechanism: lead.transmissionMechanism, capture_mechanism: lead.captureMechanism, capture_conditions: lead.captureConditions,
      supporting_source_ids: lead.supportingSourceIds, contradicting_source_ids: lead.contradictingSourceIds, evidence_gaps: lead.evidenceGaps,
      decisive_questions: lead.decisiveQuestions, catalysts: lead.catalysts, falsifiers: lead.falsifiers, expectations_question: lead.expectationsQuestion,
      materiality: lead.dimensions.materiality, transmission_confidence: lead.dimensions.transmissionConfidence, capture_plausibility: lead.dimensions.capturePlausibility,
      expectations_gap: lead.dimensions.expectationsGap, evidence_readiness: lead.dimensions.evidenceReadiness, portfolio_relevance: lead.dimensions.portfolioRelevance,
      investability: lead.dimensions.investability, decisive_new_event: lead.decisiveNewEvent,
    }))
    const { error } = await supabase.from('world_opportunity_leads').upsert(leadRows, { onConflict: 'id', ignoreDuplicates: true })
    if (error) throw new Error(`Unable to project world opportunity leads: ${error.message}`)
  }
  const { error: projectionError } = await supabase.from('world_repository_projections').insert({
    commit_sha: commit, branch, file_count: rows.length, is_canonical: false,
  })
  if (projectionError) throw new Error(`Unable to record world projection: ${projectionError.message}`)
  if (options.canonical) {
    const { error: promoteError } = await supabase.rpc('promote_world_repository_projection', { p_commit_sha: commit })
    if (promoteError) throw new Error(`Unable to promote world projection: ${promoteError.message}`)
  }
  return { commit, fileCount: rows.length, idempotent: false }
}

interface WorldIndexRow {
  commit_sha: string
  file_path: string
  node_id: string
  kind: WorldNode['kind']
  status: WorldNode['status']
  title: string
  as_of: string
  confidence: number
  importance: number
  summary: string
  aliases: string[]
  relationships: WorldNode['relationships']
  source_ids: string[]
  structured_content: WorldNode
}

export interface WorldWorkspace {
  commit: string | null
  branch: string | null
  canonical: boolean
  dataAsOf: string | null
  freshness: 'current' | 'aging' | 'stale' | 'unavailable'
  current: WorldNode | null
  latestChanges: WorldNode[]
  actors: WorldNode[]
  situations: WorldNode[]
  themes: WorldNode[]
  scenarios: WorldNode[]
  hypotheses: WorldNode[]
  indicators: WorldNode[]
  leads: Array<Record<string, unknown>>
  coverage: WorldCoverageFrontier[]
  replay: { run: WorldReplayRun | null; batches: WorldReplayBatch[] }
  health: {
    lastRunAt: string | null
    lastRunStatus: string | null
    lastCommit: string | null
    pendingEvents: number
    failedEvents: number
    quarantinedEvents: number
    oldestPendingAt: string | null
    sourceCount: number
    failure: string | null
    lastSuccessfulRunAt: string | null
    lastSuccessfulCommit: string | null
  }
}

export function latestDistinctWorldJournals(nodes: WorldNode[], limit = 2): WorldNode[] {
  const seen = new Set<string>()
  return nodes
    .filter((node) => node.kind === 'journal')
    .sort((a, b) => Date.parse(b.asOf) - Date.parse(a.asOf) || b.importance - a.importance)
    .filter((node) => {
      const key = `${node.asOf}|${node.title.trim().toLowerCase()}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, Math.max(1, limit))
}

function freshness(asOf: string | null): WorldWorkspace['freshness'] {
  if (!asOf) return 'unavailable'
  const hours = (Date.now() - Date.parse(asOf)) / 3_600_000
  return hours <= 14 ? 'current' : hours <= 36 ? 'aging' : 'stale'
}

export async function fetchWorldWorkspace(): Promise<WorldWorkspace> {
  const supabase = getSupabaseClient()
  if (!supabase) return { commit: null, branch: null, canonical: false, dataAsOf: null, freshness: 'unavailable', current: null, latestChanges: [], actors: [], situations: [], themes: [], scenarios: [], hypotheses: [], indicators: [], leads: [], coverage: [], replay: { run: null, batches: [] }, health: { lastRunAt: null, lastRunStatus: null, lastCommit: null, pendingEvents: 0, failedEvents: 0, quarantinedEvents: 0, oldestPendingAt: null, sourceCount: 0, failure: 'Supabase is not configured', lastSuccessfulRunAt: null, lastSuccessfulCommit: null } }
  const replayPromise = import('./world-replay.ts').then(({ fetchWorldReplayStatus }) => fetchWorldReplayStatus())
  const [projectionResult, runResult, successfulRunResult, eventResult, leadResult, coverage, replay] = await Promise.all([
    supabase.from('world_repository_projections').select('*').order('is_canonical', { ascending: false }).order('projected_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('world_thinker_runs').select('status,result_commit,started_at,error').order('started_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('world_thinker_runs').select('result_commit,started_at').in('status', ['projected', 'push_pending']).not('result_commit', 'is', null).order('started_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('world_event_clusters').select('processing_state,source_diversity,first_seen_at').in('processing_state', ['pending', 'failed', 'quarantined']),
    supabase.from('world_opportunity_leads').select('*').order('created_at', { ascending: false }).limit(40),
    loadWorldCoverageFrontiers(),
    replayPromise,
  ])
  if (projectionResult.error) throw new Error(`Unable to load world projection: ${projectionResult.error.message}`)
  const projection = projectionResult.data as { commit_sha: string; branch: string; is_canonical: boolean } | null
  let rows: WorldIndexRow[] = []
  if (projection) {
    const { data, error } = await supabase.from('world_file_index').select('*').eq('commit_sha', projection.commit_sha).order('importance', { ascending: false })
    if (error) throw new Error(`Unable to load world nodes: ${error.message}`)
    rows = (data ?? []) as WorldIndexRow[]
  }
  const nodes = rows.map((row) => row.structured_content)
  const current = nodes.find((node) => node.kind === 'current') ?? null
  const journals = latestDistinctWorldJournals(nodes, 2)
  const events = (eventResult.data ?? []) as Array<{ processing_state: string; source_diversity: number; first_seen_at: string }>
  const run = runResult.data as { status: string; result_commit: string | null; started_at: string; error: string | null } | null
  const successfulRun = successfulRunResult.data as { result_commit: string | null; started_at: string } | null
  const pendingDates = events.filter((event) => event.processing_state === 'pending' || event.processing_state === 'failed').map((event) => event.first_seen_at).sort()
  return {
    commit: projection?.commit_sha ?? null, branch: projection?.branch ?? null, canonical: projection?.is_canonical ?? false,
    dataAsOf: current?.asOf ?? null, freshness: freshness(current?.asOf ?? null), current, latestChanges: journals,
    actors: nodes.filter((node) => node.kind === 'actor' && ['active', 'monitoring'].includes(node.status)),
    situations: nodes.filter((node) => node.kind === 'situation' && ['active', 'monitoring'].includes(node.status)),
    themes: nodes.filter((node) => node.kind === 'theme' && ['active', 'monitoring'].includes(node.status)),
    scenarios: nodes.filter((node) => node.kind === 'scenario' && ['active', 'monitoring'].includes(node.status)),
    hypotheses: nodes.filter((node) => node.kind === 'hypothesis' && ['active', 'monitoring'].includes(node.status)),
    indicators: nodes.filter((node) => node.kind === 'indicator' && ['active', 'monitoring'].includes(node.status)),
    leads: (leadResult.data ?? []) as Array<Record<string, unknown>>,
    coverage,
    replay,
    health: {
      lastRunAt: run?.started_at ?? null, lastRunStatus: run?.status ?? null, lastCommit: run?.result_commit ?? null,
      pendingEvents: events.filter((event) => event.processing_state === 'pending').length, failedEvents: events.filter((event) => event.processing_state === 'failed').length,
      quarantinedEvents: events.filter((event) => event.processing_state === 'quarantined').length, oldestPendingAt: pendingDates[0] ?? null,
      sourceCount: events.reduce((sum, event) => sum + Number(event.source_diversity || 0), 0), failure: run?.error ?? null,
      lastSuccessfulRunAt: successfulRun?.started_at ?? null, lastSuccessfulCommit: successfulRun?.result_commit ?? null,
    },
  }
}

export async function fetchWorldNode(id: string): Promise<{ commit: string; node: WorldNode; related: WorldNode[]; history: WorldNode[]; sources: Array<Record<string, unknown>> } | null> {
  const supabase = getSupabaseClient()
  if (!supabase) return null
  const { data: projection } = await supabase.from('world_repository_projections').select('commit_sha').order('is_canonical', { ascending: false }).order('projected_at', { ascending: false }).limit(1).maybeSingle()
  if (!projection) return null
  const { data, error } = await supabase.from('world_file_index').select('*').eq('commit_sha', projection.commit_sha)
  if (error) throw new Error(`Unable to load world node: ${error.message}`)
  const rows = (data ?? []) as WorldIndexRow[]
  const row = rows.find((entry) => entry.node_id === id)
  if (!row) return null
  const targetIds = new Set(row.relationships.map((relationship) => relationship.targetId))
  for (const entry of rows) if (entry.relationships.some((relationship) => relationship.targetId === id)) targetIds.add(entry.node_id)
  const { data: history } = await supabase.from('world_file_index').select('*').eq('node_id', id).order('projected_at', { ascending: false }).limit(20)
  const { data: sources } = await supabase.from('world_event_cluster_sources').select('*').in('source_id', row.source_ids.length ? row.source_ids : ['__none__'])
  return { commit: projection.commit_sha, node: row.structured_content, related: rows.filter((entry) => targetIds.has(entry.node_id)).map((entry) => entry.structured_content), history: ((history ?? []) as WorldIndexRow[]).map((entry) => entry.structured_content), sources: (sources ?? []) as Array<Record<string, unknown>> }
}

export async function fetchWorldRuns(limit = 40): Promise<Array<Record<string, unknown>>> {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const { data, error } = await supabase.from('world_thinker_runs').select('*').order('started_at', { ascending: false }).limit(Math.max(1, Math.min(100, limit)))
  if (error) throw new Error(`Unable to load World Thinker runs: ${error.message}`)
  return (data ?? []) as Array<Record<string, unknown>>
}
