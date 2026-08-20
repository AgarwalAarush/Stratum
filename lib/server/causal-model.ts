import { MARKETS_OWNER_ID } from '../auth/markets-auth.ts'
import type { WorldNode } from '../markets/world-thinker-types.ts'
import { getSupabaseClient } from './supabase.ts'

type Row = Record<string, unknown>

function record(value: unknown): Row {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {}
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function number(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function causalState(node: WorldNode, canonical: boolean): string {
  if (!canonical) return 'shadow'
  if (node.status === 'active') return 'active'
  if (node.status === 'monitoring') return 'monitoring'
  if (node.status === 'dormant') return 'weakened'
  return 'archived'
}

function reviewDecisionForNode(node: WorldNode): 'review_world_change' | null {
  if (node.importance < 70) return null
  return ['situation', 'hypothesis', 'indicator'].includes(node.kind) ? 'review_world_change' : null
}

function reviewPayloadForNode(node: WorldNode, modelVersionId: string, commit: string): Row {
  const whatChanged = node.changeSummary?.trim() || node.summary
  return {
    owner_id: MARKETS_OWNER_ID,
    causal_model_version_id: modelVersionId,
    subject_type: 'world_change',
    subject_id: node.id,
    decision_type: 'review_world_change',
    title: node.title,
    what_changed: whatChanged,
    why_now: node.kind === 'indicator'
      ? 'A monitored condition changed enough to warrant a deliberate review.'
      : 'New sourced evidence changed the active World model.',
    if_ignored: 'The item remains monitored, but a material change may not be reflected in the next research decision.',
    attention_minutes: node.kind === 'hypothesis' ? 10 : 4,
    priority: node.importance,
    source_ids: node.sourceIds,
    metadata: { commit, kind: node.kind, confidence: node.confidence, canonical: false },
  }
}

async function attachDeltaOrCreate(payload: Row): Promise<void> {
  const supabase = getSupabaseClient()
  if (!supabase) return
  const { data: open, error } = await supabase.from('owner_review_items')
    .select('id,delta').eq('owner_id', payload.owner_id).eq('subject_type', payload.subject_type).eq('subject_id', payload.subject_id)
    .in('status', ['pending', 'in_review', 'deferred']).maybeSingle()
  if (error) throw new Error(`Unable to inspect owner review queue: ${error.message}`)
  if (!open) {
    const { error: insertError } = await supabase.from('owner_review_items').insert(payload)
    if (insertError) throw new Error(`Unable to create owner review item: ${insertError.message}`)
    return
  }
  const delta = [...(Array.isArray(open.delta) ? open.delta : []), {
    at: new Date().toISOString(), whatChanged: payload.what_changed, sourceIds: payload.source_ids, causalModelVersionId: payload.causal_model_version_id,
  }].slice(-12)
  const { error: updateError } = await supabase.from('owner_review_items').update({
    causal_model_version_id: payload.causal_model_version_id, title: payload.title, what_changed: payload.what_changed,
    why_now: payload.why_now, if_ignored: payload.if_ignored, priority: payload.priority, source_ids: payload.source_ids,
    metadata: payload.metadata, delta, updated_at: new Date().toISOString(),
  }).eq('id', open.id)
  if (updateError) throw new Error(`Unable to update owner review delta: ${updateError.message}`)
}

export async function projectWorldCausalModel(options: { commit: string; canonical: boolean; nodes: WorldNode[] }): Promise<{ modelCount: number; reviewCount: number }> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const eligible = options.nodes.filter((node) => ['active', 'monitoring'].includes(node.status)
    && ['situation', 'theme', 'market', 'scenario', 'hypothesis', 'indicator'].includes(node.kind))
  if (eligible.length === 0) return { modelCount: 0, reviewCount: 0 }
  const rows = eligible.map((node) => ({
    causal_key: `world:${node.id}`, source_kind: 'world_node', source_id: node.id, source_version: options.commit,
    source_commit: options.commit, state: causalState(node, options.canonical), title: node.title, summary: node.summary,
    mechanism: node.mechanism ?? null, economic_variable: node.economicVariable ?? null, constrained_layer: node.constrainedLayer ?? null,
    rent_recipient: node.rentRecipient ?? null, expectations_question: node.expectationsQuestion ?? null,
    confidence: node.confidence, importance: node.importance, source_ids: node.sourceIds, relationships: node.relationships,
    freshness: { asOf: node.asOf, nextReviewAt: node.nextReviewAt, canonical: options.canonical }, structured_content: node, as_of: node.asOf,
  }))
  const { data, error } = await supabase.from('causal_model_versions').upsert(rows, { onConflict: 'source_kind,source_id,source_version' }).select('id,source_id')
  if (error) throw new Error(`Unable to project World causal model: ${error.message}`)
  const ids = new Map((data ?? []).map((item) => [String(item.source_id), String(item.id)]))
  let reviewCount = 0
  for (const node of eligible) {
    if (!reviewDecisionForNode(node)) continue
    const modelVersionId = ids.get(node.id)
    if (!modelVersionId) continue
    await attachDeltaOrCreate(reviewPayloadForNode(node, modelVersionId, options.commit))
    reviewCount += 1
  }
  return { modelCount: rows.length, reviewCount }
}

export async function projectMarketThesisCausalModel(version: Row, hypothesis: Row): Promise<void> {
  const supabase = getSupabaseClient()
  if (!supabase) return
  const content = record(version.content)
  const economics = record(content.economics)
  const state = String(version.state ?? 'active')
  const row = {
    causal_key: `market-thesis:${String(version.hypothesis_id)}`, source_kind: 'market_thesis', source_id: String(version.hypothesis_id), source_version: String(version.id),
    source_commit: null, state: state === 'active' ? 'active' : state, title: String(version.title ?? hypothesis.title ?? 'Market thesis'),
    summary: String(content.summary ?? content.headline ?? hypothesis.statement ?? 'Source-backed market thesis.'),
    mechanism: typeof economics.scarcityRentCapture === 'string' ? economics.scarcityRentCapture : null,
    economic_variable: typeof economics.economicVariable === 'string' ? economics.economicVariable : null,
    constrained_layer: typeof economics.valueChain === 'string' ? economics.valueChain : null,
    rent_recipient: typeof economics.rentRecipient === 'string' ? economics.rentRecipient : null,
    expectations_question: typeof economics.expectationsQuestion === 'string' ? economics.expectationsQuestion : null,
    confidence: Math.round(number(version.confidence, 0)), importance: Math.round(number(hypothesis.priority ?? hypothesis.materiality, 50)),
    source_ids: strings(content.sourceIds), relationships: [], freshness: { dataAsOf: version.data_as_of, generatedAt: version.generated_at },
    structured_content: { hypothesis, version }, as_of: String(version.data_as_of ?? version.generated_at),
  }
  const { error } = await supabase.from('causal_model_versions').upsert(row, { onConflict: 'source_kind,source_id,source_version' })
  if (error) throw new Error(`Unable to project market thesis causal model: ${error.message}`)
}

export interface CausalModelSnapshot {
  world: Row[]
  marketTheses: Row[]
  pendingReviews: Row[]
}

export async function fetchCausalModelSnapshot(ownerId = MARKETS_OWNER_ID): Promise<CausalModelSnapshot> {
  const supabase = getSupabaseClient()
  if (!supabase) return { world: [], marketTheses: [], pendingReviews: [] }
  const [modelsResult, reviewResult] = await Promise.all([
    supabase.from('causal_model_versions').select('*').in('state', ['active', 'monitoring', 'shadow']).order('as_of', { ascending: false }).limit(250),
    supabase.from('owner_review_items').select('*').eq('owner_id', ownerId).in('status', ['pending', 'in_review', 'deferred']).order('priority', { ascending: false }).order('updated_at', { ascending: false }).limit(30),
  ])
  if (modelsResult.error) throw new Error(`Unable to load causal model: ${modelsResult.error.message}`)
  if (reviewResult.error) throw new Error(`Unable to load owner review queue: ${reviewResult.error.message}`)
  const newest = new Map<string, Row>()
  for (const item of (modelsResult.data ?? []) as Row[]) {
    const key = String(item.causal_key)
    if (!newest.has(key)) newest.set(key, item)
  }
  const models = [...newest.values()]
  return {
    world: models.filter((item) => item.source_kind === 'world_node').sort((a, b) => number(b.importance) - number(a.importance)),
    marketTheses: models.filter((item) => item.source_kind === 'market_thesis').sort((a, b) => number(b.importance) - number(a.importance)),
    pendingReviews: (reviewResult.data ?? []) as Row[],
  }
}

export async function decideOwnerReviewItem(options: { id: string; ownerId: string; status: 'in_review' | 'investigate' | 'accepted' | 'rejected' | 'no_trade' | 'revised' | 'deferred'; rationale?: string }): Promise<Row> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const terminal = ['investigate', 'accepted', 'rejected', 'no_trade', 'revised'].includes(options.status)
  const { data, error } = await supabase.from('owner_review_items').update({
    status: options.status, owner_rationale: options.rationale?.trim().slice(0, 2_000) || null,
    reviewed_at: terminal ? new Date().toISOString() : null, updated_at: new Date().toISOString(),
  }).eq('id', options.id).eq('owner_id', options.ownerId).select('*').maybeSingle()
  if (error) throw new Error(`Unable to update owner review item: ${error.message}`)
  if (!data) throw new Error('Owner review item not found')
  return data as Row
}
