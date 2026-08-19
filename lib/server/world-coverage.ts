import { WORLD_COVERAGE_FRONTIERS, assessWorldCoverage, matchesWorldCoverageFrontier, type WorldCoverageFrontier, type WorldCoverageFrontierDefinition } from '../markets/world-coverage.ts'
import type { WorldNode } from '../markets/world-thinker-types.ts'
import { getSupabaseClient } from './supabase.ts'

interface CoverageRow {
  id: string
  label: string
  description: string
  query_terms: string[]
  priority: number
  status: WorldCoverageFrontier['status']
  source_family_count: number
  evidence_event_count?: number
  weak_signal_count?: number
  active_node_ids: string[]
  open_questions: string[]
  last_evidence_at: string | null
  last_reviewed_at: string | null
  last_search_at: string | null
  next_review_at: string
}

function normalizeCoverageRow(row: CoverageRow): WorldCoverageFrontier {
  return {
    id: row.id, label: row.label, description: row.description, queryTerms: row.query_terms ?? [], priority: row.priority,
    status: row.status, sourceFamilyCount: row.source_family_count, evidenceEventCount: Number(row.evidence_event_count ?? 0), weakSignalCount: Number(row.weak_signal_count ?? 0), activeNodeIds: row.active_node_ids ?? [], openQuestions: row.open_questions ?? [],
    lastEvidenceAt: row.last_evidence_at, lastReviewedAt: row.last_reviewed_at, lastSearchAt: row.last_search_at, nextReviewAt: row.next_review_at,
  }
}

export function worldCoverageUpsertIdentity(frontier: WorldCoverageFrontierDefinition): Pick<CoverageRow, 'id' | 'label' | 'description' | 'query_terms' | 'priority'> {
  return {
    id: frontier.id,
    label: frontier.label,
    description: frontier.description,
    query_terms: frontier.queryTerms,
    priority: frontier.priority,
  }
}

export async function ensureWorldCoverageFrontiers(): Promise<void> {
  const supabase = getSupabaseClient()
  if (!supabase) return
  const rows = WORLD_COVERAGE_FRONTIERS.map((frontier) => ({
    ...worldCoverageUpsertIdentity(frontier), updated_at: new Date().toISOString(),
  }))
  const { error } = await supabase.from('world_coverage_frontiers').upsert(rows, { onConflict: 'id' })
  if (error) throw new Error(`Unable to initialize world coverage frontiers: ${error.message}`)
}

export async function loadWorldCoverageFrontiers(): Promise<WorldCoverageFrontier[]> {
  const supabase = getSupabaseClient()
  const uninitialized = () => WORLD_COVERAGE_FRONTIERS.map((frontier) => ({ ...frontier, status: 'blind_spot' as const, sourceFamilyCount: 0, evidenceEventCount: 0, weakSignalCount: 0, activeNodeIds: [], openQuestions: [], lastEvidenceAt: null, lastReviewedAt: null, lastSearchAt: null, nextReviewAt: new Date().toISOString() }))
  if (!supabase) return uninitialized()
  const { data, error } = await supabase.from('world_coverage_frontiers').select('*').order('priority', { ascending: false })
  if (error && (error.code === '42P01' || error.code === 'PGRST205')) return uninitialized()
  if (error) throw new Error(`Unable to load world coverage frontiers: ${error.message}`)
  return ((data ?? []) as CoverageRow[]).map(normalizeCoverageRow)
}

export function selectDueWorldCoverageFrontiers(frontiers: WorldCoverageFrontier[], now = new Date(), limit = 3): WorldCoverageFrontier[] {
  const rank: Record<WorldCoverageFrontier['status'], number> = { blind_spot: 4, stale: 3, thin: 2, healthy: 1 }
  return frontiers.filter((frontier) => Date.parse(frontier.nextReviewAt) <= now.getTime() || frontier.status !== 'healthy')
    .sort((a, b) => rank[b.status] - rank[a.status] || b.priority - a.priority || Date.parse(a.nextReviewAt) - Date.parse(b.nextReviewAt))
    .slice(0, Math.max(0, limit))
}

export async function refreshWorldCoverageState(nodes: WorldNode[], now = new Date()): Promise<WorldCoverageFrontier[]> {
  const supabase = getSupabaseClient()
  if (!supabase) return loadWorldCoverageFrontiers()
  const frontiers = await loadWorldCoverageFrontiers()
  const since = new Date(now.getTime() - 30 * 24 * 60 * 60_000).toISOString()
  const { data: events, error } = await supabase.from('world_event_clusters').select('id,title,summary,actors,geographies,channels,last_seen_at,source_ids').gte('last_seen_at', since)
  if (error) throw new Error(`Unable to evaluate world coverage: ${error.message}`)
  const sourceFamilies = new Map<string, Set<string>>()
  const eventIds = (events ?? []).flatMap((event) => typeof event.id === 'string' ? [event.id] : [])
  for (let index = 0; index < eventIds.length; index += 200) {
    const { data: sources, error: sourceError } = await supabase.from('world_event_cluster_sources').select('cluster_id,publisher,url,source_family').in('cluster_id', eventIds.slice(index, index + 200))
    if (sourceError) throw new Error(`Unable to evaluate world source diversity: ${sourceError.message}`)
    for (const source of sources ?? []) {
      const persistedFamily = typeof source.source_family === 'string' && source.source_family.trim() ? source.source_family.trim().toLowerCase() : null
      const publisher = typeof source.publisher === 'string' && source.publisher.trim() ? source.publisher.trim().toLowerCase() : null
      let family = persistedFamily ?? publisher
      if (!family && typeof source.url === 'string') {
        try { family = new URL(source.url).hostname.replace(/^www\./, '').toLowerCase() } catch { family = null }
      }
      if (!family || typeof source.cluster_id !== 'string') continue
      const families = sourceFamilies.get(source.cluster_id) ?? new Set<string>()
      families.add(family)
      sourceFamilies.set(source.cluster_id, families)
    }
  }
  const activeNodes = nodes.filter((node) => ['active', 'monitoring'].includes(node.status) && node.kind !== 'current' && node.kind !== 'journal')
  const { data: signals, error: signalError } = await supabase.from('world_signals').select('id,title,summary,entities,geographies,domains,economic_channels,status').in('status', ['observed', 'monitoring', 'activated'])
  if (signalError && signalError.code !== '42P01' && signalError.code !== 'PGRST205') throw new Error(`Unable to evaluate weak-signal coverage: ${signalError.message}`)
  const updates = frontiers.map((frontier) => {
    const matchingEvents = (events ?? []).filter((event) => matchesWorldCoverageFrontier(frontier, { title: event.title, summary: event.summary, actors: event.actors ?? [], geographies: event.geographies ?? [], channels: event.channels ?? [] }))
    const matchingEventSourceIds = new Set(matchingEvents.flatMap((event) => Array.isArray(event.source_ids) ? event.source_ids.filter((id): id is string => typeof id === 'string') : []))
    const matchingNodes = activeNodes.filter((node) => node.sourceIds.some((sourceId) => matchingEventSourceIds.has(sourceId)) || matchesWorldCoverageFrontier(frontier, { title: `${node.id} ${node.title} ${node.aliases.join(' ')}`, summary: node.summary }))
    const matchingSignals = (signals ?? []).filter((signal) => matchesWorldCoverageFrontier(frontier, { title: signal.title, summary: signal.summary, actors: signal.entities ?? [], geographies: signal.geographies ?? [], channels: [...(signal.domains ?? []), ...(signal.economic_channels ?? [])] }))
    const lastEvidenceAt = matchingEvents.map((event) => String(event.last_seen_at)).sort().at(-1) ?? null
    const sourceFamilyCount = new Set(matchingEvents.flatMap((event) => [...(sourceFamilies.get(String(event.id)) ?? [])])).size
    const status = assessWorldCoverage({ lastEvidenceAt, sourceFamilyCount, activeNodeCount: matchingNodes.length }, now)
    const nextReviewHours = status === 'healthy' ? 24 : status === 'thin' ? 8 : 6
    return {
      ...worldCoverageUpsertIdentity(frontier), status, source_family_count: sourceFamilyCount, evidence_event_count: matchingEvents.length, weak_signal_count: matchingSignals.length, active_node_ids: matchingNodes.map((node) => node.id),
      last_evidence_at: lastEvidenceAt, last_reviewed_at: now.toISOString(), next_review_at: new Date(now.getTime() + nextReviewHours * 3_600_000).toISOString(), updated_at: now.toISOString(),
    }
  })
  const { error: updateError } = await supabase.from('world_coverage_frontiers').upsert(updates, { onConflict: 'id' })
  if (updateError) throw new Error(`Unable to persist world coverage state: ${updateError.message}`)
  return loadWorldCoverageFrontiers()
}

export async function recordWorldCoverageSearch(frontierIds: string[], now = new Date()): Promise<void> {
  const supabase = getSupabaseClient()
  if (!supabase || frontierIds.length === 0) return
  const { error } = await supabase.from('world_coverage_frontiers').update({ last_search_at: now.toISOString(), updated_at: now.toISOString() }).in('id', frontierIds)
  if (error) throw new Error(`Unable to record world coverage search: ${error.message}`)
}
