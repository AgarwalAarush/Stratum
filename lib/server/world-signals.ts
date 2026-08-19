import { createHash } from 'node:crypto'
import type { WorldAttentionDecision } from '../markets/world-attention.ts'
import type { WorldSignalStatus } from '../markets/world-thinker-types.ts'
import type { WorldEventClusterCandidate } from './world-events.ts'
import { getSupabaseClient } from './supabase.ts'

interface SignalRow {
  id: string
  status: WorldSignalStatus
  title: string
  summary: string
  event_cluster_ids: unknown
  source_ids: unknown
  entities: unknown
  geographies: unknown
  domains: unknown
  economic_channels: unknown
  activation_conditions: unknown
  related_signal_ids: unknown
  related_node_ids: unknown
  first_observed_at: string
  last_observed_at: string
  search_text: string
}

const asStrings = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
const union = (...lists: string[][]): string[] => [...new Set(lists.flat().map((item) => item.trim()).filter(Boolean))]
const normalizedTerms = (values: string[]): Set<string> => new Set(values.flatMap((value) => value.toLowerCase().split(/[^a-z0-9]+/)).filter((value) => value.length >= 4))

function signalFingerprint(cluster: WorldEventClusterCandidate): string {
  const signature = union(cluster.actors, cluster.geographies, cluster.channels).map((value) => value.toLowerCase()).sort().join('|') || cluster.fingerprint
  return createHash('sha256').update(signature).digest('hex')
}

function activationConditions(cluster: WorldEventClusterCandidate): string[] {
  const text = `${cluster.title} ${cluster.summary} ${cluster.channels.join(' ')}`
  const conditions: string[] = []
  if (/el ni[nñ]o|la ni[nñ]a|enso|climate|weather|drought|flood/i.test(text)) conditions.push('crop failure or food-price disruption', 'hydropower or reservoir stress', 'insurance losses or commodity disruption')
  if (/authoritarian|institution|election|emergency powers/i.test(text)) conditions.push('institutional rules change', 'capital controls, sanctions, or expropriation risk', 'country-specific policy transmission')
  if (/taiwan|semiconductor|chip|export control/i.test(text)) conditions.push('shipping or fabrication disruption', 'binding export-control enforcement', 'inventory, lead-time, or substitution response')
  if (/bank|sovereign|credit|liquidity|default/i.test(text)) conditions.push('funding spread or deposit stress', 'official intervention', 'cross-border credit transmission')
  if (conditions.length === 0) conditions.push('new corroborating evidence establishes a durable economic channel')
  return conditions
}

function statusFor(decision: WorldAttentionDecision, claimState: string): WorldSignalStatus {
  if (claimState === 'retracted' || claimState === 'contested') return 'contradicted'
  if (decision.route === 'urgent' || decision.route === 'investigate') return 'activated'
  if (decision.route === 'monitor') return 'monitoring'
  return 'observed'
}

function overlap(left: string[], right: string[]): string[] {
  const rightTerms = normalizedTerms(right)
  return [...normalizedTerms(left)].filter((term) => rightTerms.has(term))
}

function activationSatisfied(prior: SignalRow, cluster: WorldEventClusterCandidate): boolean {
  const conditions = asStrings(prior.activation_conditions).join(' ')
  const newEvidence = `${cluster.title} ${cluster.summary} ${cluster.channels.join(' ')}`
  const compoundTerms = /crop|food|hydropower|reservoir|insurance|commodity|shipping|fabrication|export|inventory|lead time|funding|deposit|intervention|credit|capital control|sanction|expropriation/i
  return compoundTerms.test(conditions) && compoundTerms.test(newEvidence)
}

export async function persistWorldSignalForEvent(clusterId: string, cluster: WorldEventClusterCandidate, decision: WorldAttentionDecision): Promise<{ signalId: string | null; linkedSignalIds: string[]; reactivatedSignalIds: string[] }> {
  if (decision.route === 'noise' || decision.route === 'company_only') return { signalId: null, linkedSignalIds: [], reactivatedSignalIds: [] }
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const fingerprint = signalFingerprint(cluster)
  const signalId = `signal-${fingerprint.slice(0, 24)}`
  const since = new Date(Date.parse(cluster.lastSeenAt) - 180 * 24 * 60 * 60_000).toISOString()
  const { data: relatedRows, error: relatedError } = await supabase.from('world_signals').select('id,status,title,summary,event_cluster_ids,source_ids,entities,geographies,domains,economic_channels,activation_conditions,related_signal_ids,related_node_ids,first_observed_at,last_observed_at,search_text').gte('last_observed_at', since).neq('id', signalId).limit(500)
  if (relatedError) throw new Error(`Unable to retrieve weak signals: ${relatedError.message}`)
  const clusterFields = union(cluster.actors, cluster.geographies, cluster.channels)
  const related = ((relatedRows ?? []) as SignalRow[]).map((row) => {
    const matched = overlap(clusterFields, union(asStrings(row.entities), asStrings(row.geographies), asStrings(row.domains), asStrings(row.economic_channels)))
    return { row, matched, activates: activationSatisfied(row, cluster) }
  }).filter((item) => item.matched.length > 0 || item.activates).sort((a, b) => Number(b.activates) - Number(a.activates) || b.matched.length - a.matched.length).slice(0, 8)
  const { data: prior, error: priorError } = await supabase.from('world_signals').select('*').eq('fingerprint', fingerprint).maybeSingle()
  if (priorError) throw new Error(`Unable to resolve weak signal: ${priorError.message}`)
  const priorRow = prior as SignalRow | null
  const firstObservedAt = priorRow?.first_observed_at ?? cluster.firstSeenAt
  const relatedSignalIds = union(priorRow ? asStrings(priorRow.related_signal_ids) : [], related.map((item) => item.row.id))
  const row = {
    id: signalId,
    fingerprint,
    status: statusFor(decision, cluster.claimState),
    title: cluster.title,
    summary: cluster.summary,
    event_cluster_ids: union(priorRow ? asStrings(priorRow.event_cluster_ids) : [], [clusterId]),
    source_ids: union(priorRow ? asStrings(priorRow.source_ids) : [], cluster.sourceIds),
    entities: union(priorRow ? asStrings(priorRow.entities) : [], cluster.actors),
    geographies: union(priorRow ? asStrings(priorRow.geographies) : [], cluster.geographies),
    domains: union(priorRow ? asStrings(priorRow.domains) : [], cluster.channels),
    economic_channels: union(priorRow ? asStrings(priorRow.economic_channels) : [], cluster.channels),
    activation_conditions: union(priorRow ? asStrings(priorRow.activation_conditions) : [], activationConditions(cluster)),
    related_signal_ids: relatedSignalIds,
    related_node_ids: priorRow ? asStrings(priorRow.related_node_ids) : [],
    first_observed_at: firstObservedAt,
    last_observed_at: cluster.lastSeenAt,
    last_matched_at: related.length ? new Date().toISOString() : null,
    next_review_at: new Date(Date.parse(cluster.lastSeenAt) + (decision.route === 'awareness' ? 90 : 30) * 24 * 60 * 60_000).toISOString(),
    search_text: union([cluster.title, cluster.summary], cluster.actors, cluster.geographies, cluster.channels, activationConditions(cluster)).join(' '),
    updated_at: new Date().toISOString(),
  }
  const { error: signalError } = await supabase.from('world_signals').upsert(row, { onConflict: 'fingerprint' })
  if (signalError) throw new Error(`Unable to persist weak signal: ${signalError.message}`)
  const linkRows = related.map((item) => ({
    source_signal_id: item.row.id,
    target_signal_id: signalId,
    event_cluster_id: clusterId,
    match_dimensions: { sharedTerms: item.matched, entities: overlap(cluster.actors, asStrings(item.row.entities)), geographies: overlap(cluster.geographies, asStrings(item.row.geographies)), channels: overlap(cluster.channels, asStrings(item.row.economic_channels)) },
    rationale: item.activates ? 'New event overlaps the prior signal and satisfies a recorded activation condition.' : `Structured overlap: ${item.matched.join(', ')}`,
    activation_satisfied: item.activates,
  }))
  if (linkRows.length) {
    const { error: linkError } = await supabase.from('world_signal_links').upsert(linkRows, { onConflict: 'source_signal_id,target_signal_id,event_cluster_id' })
    if (linkError) throw new Error(`Unable to persist weak-signal links: ${linkError.message}`)
  }
  const reactivatedSignalIds = related.filter((item) => item.activates && item.row.status === 'dormant').map((item) => item.row.id)
  if (reactivatedSignalIds.length) {
    const { error: reactivationError } = await supabase.from('world_signals').update({ status: 'activated', last_matched_at: new Date().toISOString(), updated_at: new Date().toISOString() }).in('id', reactivatedSignalIds)
    if (reactivationError) throw new Error(`Unable to reactivate weak signals: ${reactivationError.message}`)
  }
  return { signalId, linkedSignalIds: related.map((item) => item.row.id), reactivatedSignalIds }
}
