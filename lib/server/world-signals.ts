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

export function worldSignalActivationConditions(cluster: WorldEventClusterCandidate): string[] {
  const evidenceText = `${cluster.title} ${cluster.summary}`
  const classifiedText = `${evidenceText} ${cluster.channels.join(' ')}`
  const conditions: string[] = []
  // Require explicit ENSO language from the sourced title/summary. A loose
  // /enso/ match also catches words such as "censorship", "sensors", and
  // "Stephenson", contaminating unrelated signals with climate conditions.
  if (/\benso\b|\bel ni[nñ]o\b|\bla ni[nñ]a\b/i.test(evidenceText)) conditions.push('crop failure or food-price disruption', 'hydropower or reservoir stress', 'insurance losses or commodity disruption')
  if (/\bauthoritarian\w*\b|\binstitution\w*\b|\belection\w*\b|\bemergency powers?\b/i.test(classifiedText)) conditions.push('institutional rules change', 'capital controls, sanctions, or expropriation risk', 'country-specific policy transmission')
  if (/\btaiwan\w*\b|\bsemiconductor\w*\b|\bchips?\b|\bexport controls?\b/i.test(classifiedText)) conditions.push('shipping or fabrication disruption', 'binding export-control enforcement', 'inventory, lead-time, or substitution response')
  if (/\bbanks?\b|\bbanking\b|\bsovereign\w*\b|\bcredit\b|\bliquidity\b|\bdefault\w*\b/i.test(classifiedText)) conditions.push('funding spread or deposit stress', 'official intervention', 'cross-border credit transmission')
  if (conditions.length === 0) conditions.push('new corroborating evidence establishes a durable economic channel')
  return conditions
}

function statusFor(decision: WorldAttentionDecision, claimState: string): WorldSignalStatus {
  if (claimState === 'retracted' || claimState === 'contested') return 'contradicted'
  if (decision.route === 'urgent' || decision.route === 'investigate') return 'activated'
  if (decision.route === 'monitor') return 'monitoring'
  return 'observed'
}

export function shouldPersistWorldSignal(cluster: WorldEventClusterCandidate, decision: WorldAttentionDecision): boolean {
  if (decision.route === 'noise' || decision.route === 'company_only') return false
  if (decision.route !== 'awareness') return true
  const dimensions = decision.dimensions
  const durableOrConnected = Math.max(
    dimensions.systemReach,
    dimensions.duration,
    dimensions.propagationPotential,
    dimensions.transmissionClarity,
  ) >= 45
  const structuredConcept = cluster.channels.length > 0 || cluster.geographies.length > 0
  const officialPrimary = decision.reasons.some((reason) => reason.includes('official or primary'))
  return durableOrConnected || structuredConcept || officialPrimary
}

function overlap(left: string[], right: string[]): string[] {
  const rightTerms = normalizedTerms(right)
  return [...normalizedTerms(left)].filter((term) => rightTerms.has(term))
}

export function worldSignalActivationSatisfied(conditions: string[], evidence: string): boolean {
  const conditionText = conditions.join(' ')
  const families = [
    { condition: /crop failure|hydropower|reservoir stress|insurance losses|commodity disruption/i, evidence: /\bcrops?\b|\bfood(?: prices?| inflation| shortage| disruption)?\b|\bhydropower\b|\breservoir\w*\b|\binsurance(?: losses?| claims?)?\b|\bcommodit(?:y|ies)(?: prices?| disruption)?\b/i },
    { condition: /institutional rules|capital controls|expropriation|country-specific policy/i, evidence: /\binstitutional rules?\b|\bemergency powers?\b|\bcapital controls?\b|\bsanctions?\b|\bexpropriat\w*\b|\bpolicy transmission\b/i },
    { condition: /shipping or fabrication|export-control enforcement|inventory, lead-time/i, evidence: /\bshipping\b|\bfabrication\b|\bfoundr(?:y|ies)\b|\bexport controls?\b|\binventor(?:y|ies)\b|\blead[ -]times?\b|\bsubstitut\w*\b/i },
    { condition: /funding spread|deposit stress|official intervention|cross-border credit/i, evidence: /\bfunding spreads?\b|\bdeposit(?: flight| stress| outflows?)\b|\bofficial intervention\b|\bcross-border credit\b|\bliquidity support\b/i },
  ]
  return families.some((family) => family.condition.test(conditionText) && family.evidence.test(evidence))
}

function activationSatisfied(prior: SignalRow, cluster: WorldEventClusterCandidate): boolean {
  return worldSignalActivationSatisfied(asStrings(prior.activation_conditions), `${cluster.title} ${cluster.summary} ${cluster.channels.join(' ')}`)
}

export async function persistWorldSignalForEvent(clusterId: string, cluster: WorldEventClusterCandidate, decision: WorldAttentionDecision): Promise<{ signalId: string | null; linkedSignalIds: string[]; reactivatedSignalIds: string[] }> {
  if (!shouldPersistWorldSignal(cluster, decision)) return { signalId: null, linkedSignalIds: [], reactivatedSignalIds: [] }
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
    activation_conditions: union(priorRow ? asStrings(priorRow.activation_conditions) : [], worldSignalActivationConditions(cluster)),
    related_signal_ids: relatedSignalIds,
    related_node_ids: priorRow ? asStrings(priorRow.related_node_ids) : [],
    first_observed_at: firstObservedAt,
    last_observed_at: cluster.lastSeenAt,
    last_matched_at: related.length ? new Date().toISOString() : null,
    next_review_at: new Date(Date.parse(cluster.lastSeenAt) + (decision.route === 'awareness' ? 90 : 30) * 24 * 60 * 60_000).toISOString(),
    search_text: union([cluster.title, cluster.summary], cluster.actors, cluster.geographies, cluster.channels, worldSignalActivationConditions(cluster)).join(' '),
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
