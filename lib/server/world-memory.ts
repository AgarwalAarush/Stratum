import { createHash } from 'node:crypto'
import type {
  MarketHypothesis,
  MarketHypothesisEvidence,
  MarketThesisVersion,
  MarketThesisWorkspaceData,
  ThesisPrediction,
  WorldBaseline,
  WorldEntityKind,
  WorldObservation,
  WorldObservationKind,
  WorldSourceTier,
} from '../markets/types.ts'
import { getSupabaseClient } from './supabase.ts'
import { mirrorObservationToWarehouse, storeWorldCorpusDocument } from './world-corpus.ts'
import { resolveApprovedWorldSource } from './world-source-control.ts'

const CORE_POWER_MECHANISMS = ['data_center_load', 'firm_capacity_constraint', 'interconnection_constraint', 'equipment_lead_time'] as const

export interface WorldObservationInput {
  title: string
  canonicalUrl: string
  publisher: string
  sourceTier: WorldSourceTier
  /** Optional for legacy evidence; required for all newly governed adapters. */
  sourceSlug?: string
  body: string
  /** Original source bytes when `body` is a cleaned extraction. */
  rawBody?: string | Buffer
  sourceExtension?: string
  mimeType?: string
  publishedAt?: string | null
  assertion: string
  kind: WorldObservationKind
  domain: string
  mechanism: string
  entities?: Array<{ kind: WorldEntityKind; name: string; aliases?: string[] }>
  geography?: string | null
  numericValue?: number | null
  numericUnit?: string | null
  observedAt?: string | null
  validFrom?: string | null
  validTo?: string | null
  confidence?: number
  materiality?: number
  novelty?: number
  decayHours?: number | null
  supersedesId?: string | null
}

type RecordValue = Record<string, unknown>

function record(value: unknown): RecordValue {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {}
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function iso(value: unknown): string | null {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return null
  return new Date(value).toISOString()
}

function number(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function score(value: unknown, fallback: number): number {
  return Math.max(0, Math.min(100, number(value, fallback)))
}

function observationFingerprint(input: WorldObservationInput, documentHash: string): string {
  return createHash('sha256').update(JSON.stringify({
    documentHash,
    assertion: input.assertion.trim(),
    mechanism: input.mechanism.trim(),
    numericValue: input.numericValue ?? null,
    numericUnit: input.numericUnit ?? null,
    observedAt: input.observedAt ?? null,
  })).digest('hex')
}

async function resolveEntities(input: NonNullable<WorldObservationInput['entities']>): Promise<string[]> {
  const supabase = getSupabaseClient()!
  const ids: string[] = []
  for (const entity of input) {
    const canonicalName = entity.name.trim()
    if (!canonicalName) continue
    const { data, error } = await supabase.from('world_entities').upsert({
      kind: entity.kind,
      canonical_name: canonicalName,
      aliases: entity.aliases ?? [],
      updated_at: new Date().toISOString(),
    }, { onConflict: 'kind,canonical_name' }).select('id').single()
    if (error || !data) throw new Error(`Unable to resolve world entity ${canonicalName}: ${error?.message ?? 'unknown error'}`)
    ids.push(String(data.id))
  }
  return ids
}

export async function ingestWorldObservation(input: WorldObservationInput): Promise<WorldObservation> {
  if (!input.title.trim() || !input.canonicalUrl.trim() || !input.assertion.trim() || !input.domain.trim() || !input.mechanism.trim()) {
    throw new Error('World observations require title, URL, assertion, domain, and mechanism')
  }
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const governedSource = input.sourceSlug
    ? await resolveApprovedWorldSource(input.sourceSlug, input.canonicalUrl, input.mimeType)
    : null
  if (governedSource && !governedSource.contract.assertionsAllowed.includes(input.kind)) {
    throw new Error(`Source ${governedSource.source.slug} contract does not permit ${input.kind} observations`)
  }
  const stored = await storeWorldCorpusDocument({
    body: input.rawBody ?? input.body,
    extractedText: input.body,
    mimeType: input.mimeType,
    extension: input.sourceExtension ?? (input.mimeType?.includes('html') ? 'html' : 'txt'),
    title: input.title,
    canonicalUrl: input.canonicalUrl,
    publisher: input.publisher,
    domain: input.domain,
    publishedAt: input.publishedAt,
  })
  const now = new Date().toISOString()
  const { data: documentRow, error: documentError } = await supabase.from('world_documents').upsert({
    content_hash: stored.contentHash,
    canonical_url: input.canonicalUrl,
    title: input.title,
    publisher: input.publisher,
    source_registry_id: governedSource?.source.id ?? null,
    source_tier: input.sourceTier,
    mime_type: input.mimeType ?? 'text/plain',
    archive_key: stored.archiveKey,
    extracted_key: stored.extractedKey,
    extraction_status: 'complete',
    published_at: iso(input.publishedAt),
    ingested_at: now,
    backup_state: process.env.RESTIC_REPOSITORY ? 'pending' : 'not_configured',
    metadata: { byteCount: stored.byteCount, sourceContractVersion: governedSource?.contract.version ?? null },
  }, { onConflict: 'content_hash' }).select('*').single()
  if (documentError || !documentRow) throw new Error(`Unable to persist world document: ${documentError?.message ?? 'unknown error'}`)

  const entityIds = await resolveEntities(input.entities ?? [])
  const fingerprint = observationFingerprint(input, stored.contentHash)
  const { data: observationRow, error: observationError } = await supabase.from('world_observations').upsert({
    document_id: documentRow.id,
    assertion: input.assertion.trim(),
    observation_kind: input.kind,
    domain: input.domain.trim(),
    mechanism: input.mechanism.trim(),
    geography: input.geography?.trim() || null,
    numeric_value: input.numericValue ?? null,
    numeric_unit: input.numericUnit?.trim() || null,
    valid_from: iso(input.validFrom),
    valid_to: iso(input.validTo),
    observed_at: iso(input.observedAt),
    published_at: iso(input.publishedAt),
    ingested_at: now,
    confidence: score(input.confidence, 65),
    materiality: score(input.materiality, 50),
    novelty: score(input.novelty, 50),
    decay_hours: input.decayHours ?? null,
    supersedes_id: input.supersedesId ?? null,
    fingerprint,
  }, { onConflict: 'fingerprint' }).select('*').single()
  if (observationError || !observationRow) throw new Error(`Unable to persist world observation: ${observationError?.message ?? 'unknown error'}`)
  if (entityIds.length > 0) {
    const { error } = await supabase.from('world_observation_entities').upsert(entityIds.map((entityId) => ({
      observation_id: observationRow.id,
      entity_id: entityId,
    })), { onConflict: 'observation_id,entity_id', ignoreDuplicates: true })
    if (error) throw new Error(`Unable to link world observation entities: ${error.message}`)
  }
  void mirrorObservationToWarehouse({
    id: observationRow.id,
    domain: observationRow.domain,
    mechanism: observationRow.mechanism,
    assertion: observationRow.assertion,
    publishedAt: observationRow.published_at,
    ingestedAt: observationRow.ingested_at,
    confidence: Number(observationRow.confidence),
    materiality: Number(observationRow.materiality),
  }).catch(() => undefined)
  return normalizeObservation(observationRow, documentRow, entityIds)
}

function normalizeObservation(row: RecordValue, document: RecordValue, entityIds: string[] = []): WorldObservation {
  return {
    id: String(row.id), documentId: String(row.document_id), assertion: String(row.assertion),
    kind: row.observation_kind as WorldObservationKind, domain: String(row.domain), mechanism: String(row.mechanism),
    entityIds, geography: row.geography === null ? null : String(row.geography ?? ''),
    numericValue: row.numeric_value === null ? null : number(row.numeric_value),
    numericUnit: row.numeric_unit === null ? null : String(row.numeric_unit ?? ''),
    validFrom: iso(row.valid_from), validTo: iso(row.valid_to), observedAt: iso(row.observed_at), publishedAt: iso(row.published_at),
    ingestedAt: String(row.ingested_at), confidence: number(row.confidence), materiality: number(row.materiality), novelty: number(row.novelty),
    decayHours: row.decay_hours === null ? null : number(row.decay_hours), supersedesId: row.supersedes_id === null ? null : String(row.supersedes_id ?? ''),
    source: {
      title: String(document.title ?? 'Source'), canonicalUrl: String(document.canonical_url ?? ''), publisher: String(document.publisher ?? ''), sourceTier: document.source_tier as WorldSourceTier,
    },
  }
}

async function loadRecentObservations(domain?: string, limit = 160): Promise<Array<{ row: RecordValue; document: RecordValue; entityIds: string[] }>> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  let query = supabase.from('world_observations').select('*,world_documents(*)').order('ingested_at', { ascending: false }).limit(limit)
  if (domain) query = query.eq('domain', domain)
  const { data, error } = await query
  if (error) throw new Error(`Unable to load world observations: ${error.message}`)
  const ids = (data ?? []).map((item) => item.id)
  const { data: joins, error: joinError } = ids.length > 0
    ? await supabase.from('world_observation_entities').select('observation_id,entity_id').in('observation_id', ids)
    : { data: [], error: null }
  if (joinError) throw new Error(`Unable to load world observation entities: ${joinError.message}`)
  const entitiesByObservation = new Map<string, string[]>()
  for (const join of joins ?? []) {
    const values = entitiesByObservation.get(join.observation_id) ?? []
    values.push(join.entity_id)
    entitiesByObservation.set(join.observation_id, values)
  }
  return (data ?? []).map((item) => ({ row: item as RecordValue, document: record(item.world_documents), entityIds: entitiesByObservation.get(item.id) ?? [] }))
}

function baselineMarkdown(scopeType: WorldBaseline['scopeType'], scopeKey: string, content: WorldBaseline['content']): string {
  const list = (title: string, values: string[]) => values.length > 0 ? `## ${title}\n${values.map((value) => `- ${value}`).join('\n')}` : ''
  return [
    `# ${scopeType === 'global' ? 'Global market baseline' : `${scopeKey} baseline`}`,
    '', content.state,
    list('What changed', content.changes),
    list('Constraints', content.constraints),
    list('Open questions', content.openQuestions),
    list('Contradictions', content.contradictions),
    list('Dormant signals', content.dormantSignals),
    list('Active hypotheses', content.activeHypotheses),
  ].filter(Boolean).join('\n\n')
}

export async function compileWorldBaseline(scopeType: WorldBaseline['scopeType'], scopeKey: string): Promise<WorldBaseline> {
  const relevant = await loadRecentObservations(scopeType === 'domain' ? scopeKey : undefined)
  const observations = relevant.map(({ row, document, entityIds }) => normalizeObservation(row, document, entityIds))
  const material = observations.filter((item) => item.materiality >= 55)
  const byMechanism = new Map<string, WorldObservation[]>()
  material.forEach((item) => byMechanism.set(item.mechanism, [...(byMechanism.get(item.mechanism) ?? []), item]))
  const [hypotheses, current] = await Promise.all([
    fetchMarketHypothesesInternal(),
    fetchLatestBaselineRow(scopeType, scopeKey),
  ])
  const content: WorldBaseline['content'] = {
    state: material.length > 0
      ? `${material.length} material observations are currently retained for ${scopeType === 'global' ? 'the global market' : scopeKey}.`
      : `No material observations have yet been retained for ${scopeKey}.`,
    changes: material.slice(0, 8).map((item) => item.assertion),
    constraints: [...byMechanism.entries()].filter(([mechanism]) => /constraint|interconnection|lead.?time|supply|capacity/i.test(mechanism)).slice(0, 6).map(([mechanism, items]) => `${mechanism}: ${items[0]!.assertion}`),
    openQuestions: material.length < 3 ? ['More primary evidence is required before a durable market view can be formed.'] : [],
    contradictions: observations.filter((item) => item.kind === 'inference' && item.confidence < 50).slice(0, 4).map((item) => item.assertion),
    dormantSignals: observations.filter((item) => item.materiality < 55).slice(0, 6).map((item) => item.assertion),
    activeHypotheses: hypotheses.filter((item) => item.status === 'active').map((item) => item.title),
  }
  const priorContent = current ? record(current.content) : {}
  const priorChanges = strings(priorContent.changes)
  const diff = content.changes.filter((item) => !priorChanges.includes(item)).slice(0, 8)
  const version = Number(current?.version ?? 0) + 1
  const now = new Date().toISOString()
  const markdown = baselineMarkdown(scopeType, scopeKey, content)
  const supabase = getSupabaseClient()!
  const { data, error } = await supabase.from('world_baselines').insert({
    scope_type: scopeType, scope_key: scopeKey, version, content, markdown,
    observation_ids: observations.map((item) => item.id), source_ids: observations.map((item) => item.documentId), diff,
    data_as_of: observations[0]?.ingestedAt ?? now, generated_at: now,
    freshness: observations.length === 0 ? 'stale' : 'fresh',
  }).select('*').single()
  if (error || !data) throw new Error(`Unable to persist world baseline: ${error?.message ?? 'unknown error'}`)
  return normalizeBaseline(data as RecordValue)
}

async function fetchLatestBaselineRow(scopeType: WorldBaseline['scopeType'], scopeKey: string): Promise<RecordValue | null> {
  const supabase = getSupabaseClient()!
  const { data, error } = await supabase.from('world_baselines').select('*').eq('scope_type', scopeType).eq('scope_key', scopeKey).order('version', { ascending: false }).limit(1).maybeSingle()
  if (error) throw new Error(`Unable to load latest baseline: ${error.message}`)
  return data as RecordValue | null
}

function normalizeBaseline(row: RecordValue): WorldBaseline {
  const content = record(row.content)
  return {
    id: String(row.id), scopeType: row.scope_type as WorldBaseline['scopeType'], scopeKey: String(row.scope_key), version: number(row.version),
    content: {
      state: String(content.state ?? ''), changes: strings(content.changes), constraints: strings(content.constraints), openQuestions: strings(content.openQuestions),
      contradictions: strings(content.contradictions), dormantSignals: strings(content.dormantSignals), activeHypotheses: strings(content.activeHypotheses),
    },
    markdown: String(row.markdown), observationIds: strings(row.observation_ids), sourceIds: strings(row.source_ids), dataAsOf: String(row.data_as_of), generatedAt: String(row.generated_at), diff: strings(row.diff), freshness: row.freshness as WorldBaseline['freshness'],
  }
}

function normalizeHypothesis(row: RecordValue, evidence: MarketHypothesisEvidence[] = []): MarketHypothesis {
  const graph = Array.isArray(row.causal_graph) ? row.causal_graph.map(record).map((item) => ({ from: String(item.from ?? ''), to: String(item.to ?? ''), mechanism: String(item.mechanism ?? ''), core: Boolean(item.core) })) : []
  return {
    id: String(row.id), ownerId: String(row.owner_id), title: String(row.title), status: row.status as MarketHypothesis['status'], scope: String(row.scope), horizon: String(row.horizon), coreMechanism: String(row.core_mechanism),
    causalGraph: graph, confidence: number(row.confidence), unresolvedNodes: strings(row.unresolved_nodes), counterThesis: String(row.counter_thesis), parentHypothesisId: row.parent_hypothesis_id === null ? null : String(row.parent_hypothesis_id ?? ''),
    createdAt: String(row.created_at), updatedAt: String(row.updated_at), evidence,
  }
}

async function fetchMarketHypothesesInternal(ownerId?: string): Promise<MarketHypothesis[]> {
  const supabase = getSupabaseClient()!
  let query = supabase.from('market_hypotheses').select('*').order('updated_at', { ascending: false }).limit(80)
  if (ownerId) query = query.eq('owner_id', ownerId)
  const { data, error } = await query
  if (error) throw new Error(`Unable to load market hypotheses: ${error.message}`)
  return (data ?? []).map((row) => normalizeHypothesis(row as RecordValue))
}

export async function correlateAiPowerHypothesis(ownerId: string): Promise<MarketHypothesis | null> {
  const observations = await loadRecentObservations('ai-power', 240)
  const normalized = observations.map(({ row, document, entityIds }) => normalizeObservation(row, document, entityIds))
  const matched = CORE_POWER_MECHANISMS.flatMap((mechanism) => normalized.filter((item) => item.mechanism === mechanism).slice(0, 2))
  const mechanisms = new Set(matched.map((item) => item.mechanism))
  if (mechanisms.size < 3) return null
  const primaryCount = new Set(matched.filter((item) => item.source.sourceTier === 'primary' || item.source.sourceTier === 'regulatory').map((item) => item.documentId)).size
  const independentCount = new Set(matched.filter((item) => item.source.sourceTier === 'independent').map((item) => item.documentId)).size
  const unresolvedNodes = CORE_POWER_MECHANISMS.filter((item) => !mechanisms.has(item))
  const confidence = Math.min(90, 45 + mechanisms.size * 12 + Math.min(10, primaryCount * 4) + Math.min(6, independentCount * 3))
  const existing = (await fetchMarketHypothesesInternal(ownerId)).find((item) => item.scope === 'ai-power' && !['rejected', 'archived'].includes(item.status))
  const causalGraph = [
    { from: 'Data-center and AI load growth', to: 'Regional firm-power demand', mechanism: 'data_center_load', core: true },
    { from: 'Slow firm generation additions', to: 'Regional firm-power scarcity', mechanism: 'firm_capacity_constraint', core: true },
    { from: 'Interconnection delays', to: 'Delayed load-serving capacity', mechanism: 'interconnection_constraint', core: true },
    { from: 'Equipment lead times', to: 'Slow capacity response', mechanism: 'equipment_lead_time', core: false },
    { from: 'Regional firm-power scarcity', to: 'Scarcity rents for proven supply and enabling equipment', mechanism: 'economic_capture', core: true },
  ]
  const supabase = getSupabaseClient()!
  const payload = {
    owner_id: ownerId,
    title: 'AI-driven firm-power scarcity may create regional scarcity rents',
    status: existing?.status === 'active' ? 'active' : confidence >= 65 ? 'proposed' : 'forming',
    scope: 'ai-power', horizon: '1–5 years',
    core_mechanism: 'Data-center load growth collides with slow firm-capacity, interconnection, and equipment response.',
    causal_graph: causalGraph, confidence, unresolved_nodes: unresolvedNodes,
    counter_thesis: 'Efficiency gains, flexible load, generation overbuild, grid reform, or lower AI capital spending could eliminate scarcity before it produces durable rents.',
    updated_at: new Date().toISOString(),
  }
  const { data, error } = existing
    ? await supabase.from('market_hypotheses').update(payload).eq('id', existing.id).select('*').single()
    : await supabase.from('market_hypotheses').insert(payload).select('*').single()
  if (error || !data) throw new Error(`Unable to persist AI-power hypothesis: ${error?.message ?? 'unknown error'}`)
  const { error: evidenceError } = await supabase.from('market_hypothesis_evidence').upsert(matched.map((item) => ({
    hypothesis_id: data.id, observation_id: item.id, role: 'supporting', causal_node: item.mechanism, weight: Math.round((item.confidence + item.materiality) / 2), explanation: item.assertion,
  })), { onConflict: 'hypothesis_id,observation_id,causal_node' })
  if (evidenceError) throw new Error(`Unable to persist hypothesis evidence: ${evidenceError.message}`)
  const evidence: MarketHypothesisEvidence[] = matched.map((item) => ({ observationId: item.id, role: 'supporting', causalNode: item.mechanism, weight: Math.round((item.confidence + item.materiality) / 2), explanation: item.assertion }))
  return normalizeHypothesis(data as RecordValue, evidence)
}

export interface HypothesisPromotionEvidence {
  causalNode: string
  sourceTier: WorldSourceTier
  observedAt: string | null
}

export function marketHypothesisPromotionEligible(
  hypothesis: MarketHypothesis,
  evidence: HypothesisPromotionEvidence[],
  now = new Date(),
): boolean {
  const core = hypothesis.causalGraph.filter((edge) => edge.core).map((edge) => edge.mechanism)
  // Economic capture is the bridge from a market condition to an investable
  // exposure. It is supplied by the thesis synthesis; every factual core node
  // must, independently, have fresh official support.
  const factualCore = core.filter((mechanism) => mechanism !== 'economic_capture')
  const freshCutoff = now.getTime() - 120 * 24 * 60 * 60 * 1_000
  const officialByNode = new Set(evidence
    .filter((item) => (item.sourceTier === 'primary' || item.sourceTier === 'regulatory')
      && item.observedAt && Date.parse(item.observedAt) >= freshCutoff)
    .map((item) => item.causalNode))
  const independentCrossCheck = evidence.some((item) => item.sourceTier === 'independent'
    && item.observedAt && Date.parse(item.observedAt) >= freshCutoff)
  return hypothesis.confidence >= 65
    && factualCore.every((mechanism) => officialByNode.has(mechanism))
    && independentCrossCheck
    && hypothesis.unresolvedNodes.length <= 1
}

export async function promoteEligibleMarketHypothesis(ownerId: string): Promise<MarketThesisVersion | null> {
  const hypothesis = await correlateAiPowerHypothesis(ownerId)
  if (!hypothesis) return null
  const supabase = getSupabaseClient()!
  const { data: evidenceRows, error: evidenceError } = await supabase
    .from('market_hypothesis_evidence')
    .select('causal_node,role,world_observations(observed_at,published_at,ingested_at,world_documents(*))')
    .eq('hypothesis_id', hypothesis.id)
  if (evidenceError) throw new Error(`Unable to load market thesis evidence: ${evidenceError.message}`)
  const promotionEvidence = (evidenceRows ?? []).flatMap((row) => {
    if (row.role !== 'supporting') return []
    const observation = record(row.world_observations)
    const document = record(observation.world_documents)
    return [{
      causalNode: String(row.causal_node),
      sourceTier: document.source_tier as WorldSourceTier,
      observedAt: iso(observation.observed_at) ?? iso(observation.published_at) ?? iso(observation.ingested_at),
    }]
  })
  if (!marketHypothesisPromotionEligible(hypothesis, promotionEvidence)) return null
  const { data: priorRows, error: priorError } = await supabase.from('market_thesis_versions').select('*').eq('hypothesis_id', hypothesis.id).order('version', { ascending: false }).limit(1)
  if (priorError) throw new Error(`Unable to inspect prior market thesis: ${priorError.message}`)
  const prior = priorRows?.[0] as RecordValue | undefined
  const { data: researchRows, error: researchError } = await supabase
    .from('market_hypothesis_research_versions')
    .select('*')
    .eq('hypothesis_id', hypothesis.id)
    .eq('status', 'complete')
    .order('version', { ascending: false })
    .limit(1)
  if (researchError) throw new Error(`Unable to load validated market research: ${researchError.message}`)
  const researchRow = researchRows?.[0] as RecordValue | undefined
  // The deterministic evidence gate is necessary but not sufficient. A
  // publishable market thesis must also have a completed analyst/critic pass.
  if (!researchRow) return null
  const { normalizeResearchVersion } = await import('./market-thesis-research.ts')
  const research = normalizeResearchVersion(researchRow)
  if (!research.content || research.critique?.verdict !== 'pass') return null
  const researchContent = research.content
  if (prior && String(prior.research_version_id ?? '') === research.id) {
    const [predictionResult, exposureResult] = await Promise.all([
      supabase.from('market_thesis_predictions').select('*').eq('market_thesis_version_id', prior.id),
      supabase.from('market_thesis_exposures').select('*').eq('market_thesis_version_id', prior.id),
    ])
    if (predictionResult.error || exposureResult.error) throw new Error(`Unable to load existing market thesis: ${predictionResult.error?.message ?? exposureResult.error?.message}`)
    return normalizeThesis(prior, (predictionResult.data ?? []) as RecordValue[], (exposureResult.data ?? []) as RecordValue[])
  }
  const ledger = (evidenceRows ?? []).flatMap((row) => {
    const observation = record(row.world_observations)
    const document = record(observation.world_documents)
    return document.id ? [{ documentId: String(document.id), label: String(document.title), url: String(document.canonical_url), tier: document.source_tier as WorldSourceTier }] : []
  })
  const sourceLedger = ledger.filter((item) => research.sourceIds.includes(item.documentId))
  const version = Number(prior?.version ?? 0) + 1
  const now = new Date().toISOString()
  const content = {
    whyNow: researchContent.whyNow,
    economics: `${researchContent.economics.valueChain} ${researchContent.economics.scarcityRentCapture}`,
    expectations: `${researchContent.expectations.currentNarrative} ${researchContent.expectations.whatAppearsPriced} Variant view: ${researchContent.expectations.variantView}`,
    falsifiers: researchContent.falsifiers.map((item) => `${item.condition}: ${item.thesisImpact}`),
    counterThesis: researchContent.counterThesis.statement,
    sourceLedger,
  }
  const { data, error } = await supabase.from('market_thesis_versions').insert({
    hypothesis_id: hypothesis.id, version, state: 'active', title: hypothesis.title, content, confidence: hypothesis.confidence,
    research_version_id: research.id, data_as_of: research.dataAsOf, generated_at: now,
    revision_diff: prior ? research.revisionDiff : ['Initial promotion after source-backed analyst and critic validation.'],
  }).select('*').single()
  if (error || !data) throw new Error(`Unable to promote market thesis: ${error?.message ?? 'unknown error'}`)
  const predictions = researchContent.predictions.map((item) => ({
    prediction: item.prediction, expected_direction: `Confirm: ${item.confirmation}; disconfirm: ${item.disconfirmation}`,
    deadline: null, evidence_needed: item.leadingIndicator, result: 'pending',
  }))
  const { data: predictionRows, error: predictionError } = await supabase.from('market_thesis_predictions').insert(predictions.map((item) => ({ ...item, market_thesis_version_id: data.id }))).select('*')
  if (predictionError) throw new Error(`Unable to persist market thesis predictions: ${predictionError.message}`)
  const exposureRows = researchContent.economics.beneficiaries.map((entityName) => ({
    market_thesis_version_id: data.id, value_chain_layer: researchContent.economics.valueChain, entity_name: entityName,
    symbol: null, role: 'beneficiary', mechanism: researchContent.economics.scarcityRentCapture,
    materiality: Math.round(researchContent.confidence), confidence: Math.round(researchContent.confidence), verification_status: 'needs_company_research',
  }))
  const { data: persistedExposures, error: exposureError } = exposureRows.length > 0
    ? await supabase.from('market_thesis_exposures').insert(exposureRows).select('*')
    : { data: [], error: null }
  if (exposureError) throw new Error(`Unable to persist market thesis exposures: ${exposureError.message}`)
  await supabase.from('market_hypotheses').update({ status: 'active', updated_at: now }).eq('id', hypothesis.id)
  return normalizeThesis(data as RecordValue, (predictionRows ?? []) as RecordValue[], (persistedExposures ?? []) as RecordValue[])
}

function normalizeThesis(row: RecordValue, predictionRows: RecordValue[], exposureRows: RecordValue[]): MarketThesisVersion {
  const content = record(row.content)
  return {
    id: String(row.id), hypothesisId: String(row.hypothesis_id), version: number(row.version), state: row.state as MarketThesisVersion['state'], title: String(row.title),
    content: {
      whyNow: String(content.whyNow ?? ''), economics: String(content.economics ?? ''), expectations: String(content.expectations ?? ''), falsifiers: strings(content.falsifiers), counterThesis: String(content.counterThesis ?? ''),
      sourceLedger: Array.isArray(content.sourceLedger) ? content.sourceLedger.map(record).map((item) => ({ documentId: String(item.documentId ?? ''), label: String(item.label ?? ''), url: String(item.url ?? ''), tier: item.tier as WorldSourceTier })) : [],
    },
    confidence: number(row.confidence), dataAsOf: String(row.data_as_of), generatedAt: String(row.generated_at), revisionDiff: strings(row.revision_diff), researchVersionId: row.research_version_id === null ? null : String(row.research_version_id ?? ''),
    predictions: predictionRows.map((item): ThesisPrediction => ({ id: String(item.id), prediction: String(item.prediction), expectedDirection: String(item.expected_direction), deadline: iso(item.deadline), evidenceNeeded: String(item.evidence_needed), result: item.result as ThesisPrediction['result'], evaluatedAt: iso(item.evaluated_at) })),
    exposures: exposureRows.map((item) => ({ id: String(item.id), valueChainLayer: String(item.value_chain_layer), entityName: String(item.entity_name), symbol: item.symbol === null ? null : String(item.symbol ?? ''), role: item.role as 'beneficiary' | 'loser' | 'substitute', mechanism: String(item.mechanism), materiality: number(item.materiality), confidence: number(item.confidence), verificationStatus: item.verification_status as 'verified' | 'needs_company_research' | 'unverified' })),
  }
}

export async function fetchMarketThesisWorkspace(ownerId: string): Promise<MarketThesisWorkspaceData> {
  const supabase = getSupabaseClient()
  if (!supabase) return { baseline: null, hypotheses: [], theses: [] }
  const [baselineRow, hypothesisResult] = await Promise.all([
    fetchLatestBaselineRow('global', 'global'),
    supabase.from('market_hypotheses').select('*').eq('owner_id', ownerId).order('updated_at', { ascending: false }).limit(80),
  ])
  if (hypothesisResult.error) throw new Error(`Unable to load market thesis workspace: ${hypothesisResult.error.message}`)
  const hypothesisIds = (hypothesisResult.data ?? []).map((item) => item.id)
  const thesisResult = hypothesisIds.length > 0
    ? await supabase.from('market_thesis_versions').select('*').in('hypothesis_id', hypothesisIds).order('generated_at', { ascending: false }).limit(80)
    : { data: [], error: null }
  if (thesisResult.error) throw new Error(`Unable to load market thesis workspace: ${thesisResult.error.message}`)
  const thesisIds = (thesisResult.data ?? []).map((item) => item.id)
  const [predictionResult, exposureResult] = thesisIds.length > 0 ? await Promise.all([
    supabase.from('market_thesis_predictions').select('*').in('market_thesis_version_id', thesisIds),
    supabase.from('market_thesis_exposures').select('*').in('market_thesis_version_id', thesisIds),
  ]) : [{ data: [], error: null }, { data: [], error: null }]
  if (predictionResult.error || exposureResult.error) throw new Error(`Unable to load market thesis details: ${predictionResult.error?.message ?? exposureResult.error?.message}`)
  const researchResult = hypothesisIds.length > 0
    ? await supabase.from('market_hypothesis_research_versions').select('*').in('hypothesis_id', hypothesisIds).order('version', { ascending: false })
    : { data: [], error: null }
  // Production can briefly be behind the additive migration. Keep the existing
  // thesis workspace readable until that schema and the worker are aligned.
  if (researchResult.error && !/market_hypothesis_research_versions|schema cache/i.test(researchResult.error.message)) {
    throw new Error(`Unable to load market research versions: ${researchResult.error.message}`)
  }
  const predictionsByThesis = new Map<string, RecordValue[]>()
  for (const item of predictionResult.data ?? []) predictionsByThesis.set(item.market_thesis_version_id, [...(predictionsByThesis.get(item.market_thesis_version_id) ?? []), item as RecordValue])
  const exposuresByThesis = new Map<string, RecordValue[]>()
  for (const item of exposureResult.data ?? []) exposuresByThesis.set(item.market_thesis_version_id, [...(exposuresByThesis.get(item.market_thesis_version_id) ?? []), item as RecordValue])
  const latestResearchByHypothesis = new Map<string, import('../markets/types.ts').MarketHypothesisResearchVersion>()
  if (!researchResult.error) {
    const { normalizeResearchVersion } = await import('./market-thesis-research.ts')
    for (const item of researchResult.data ?? []) {
      const normalized = normalizeResearchVersion(item as RecordValue)
      if (!latestResearchByHypothesis.has(normalized.hypothesisId)) latestResearchByHypothesis.set(normalized.hypothesisId, normalized)
    }
  }
  return {
    baseline: baselineRow ? normalizeBaseline(baselineRow) : null,
    hypotheses: (hypothesisResult.data ?? []).map((item) => {
      const hypothesis = normalizeHypothesis(item as RecordValue)
      return { ...hypothesis, latestResearch: latestResearchByHypothesis.get(hypothesis.id) ?? null }
    }),
    theses: (thesisResult.data ?? []).map((item) => normalizeThesis(item as RecordValue, predictionsByThesis.get(item.id) ?? [], exposuresByThesis.get(item.id) ?? [])),
  }
}

export async function setMarketThesisAction(ownerId: string, hypothesisId: string, action: 'freeze' | 'reject' | 'archive' | 'reactivate'): Promise<void> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const status = action === 'reject' ? 'rejected' : action === 'archive' ? 'archived' : action === 'reactivate' ? 'active' : 'proposed'
  const { error } = await supabase.from('market_hypotheses').update({ status, updated_at: new Date().toISOString() }).eq('id', hypothesisId).eq('owner_id', ownerId)
  if (error) throw new Error(`Unable to update market thesis: ${error.message}`)
}

export async function fetchMarketThesisDetail(ownerId: string, hypothesisId: string): Promise<{ hypothesis: MarketHypothesis; theses: MarketThesisVersion[] } | null> {
  const workspace = await fetchMarketThesisWorkspace(ownerId)
  const hypothesis = workspace.hypotheses.find((item) => item.id === hypothesisId)
  if (!hypothesis) return null
  return { hypothesis, theses: workspace.theses.filter((item) => item.hypothesisId === hypothesisId) }
}

/** Test-only fixture data. Production ingestion must archive real source bytes first. */
export async function seedAiPowerDemoObservations(ownerId: string): Promise<{ observations: number; hypothesis: MarketHypothesis | null; thesis: MarketThesisVersion | null }> {
  const now = new Date().toISOString()
  const sources: WorldObservationInput[] = [
    {
      title: 'AI and data-center power demand source packet', canonicalUrl: 'https://www.eia.gov/electricity/', publisher: 'U.S. Energy Information Administration', sourceTier: 'regulatory', body: 'Source packet queued for EIA electricity demand and generation evidence.', publishedAt: now,
      assertion: 'AI and data-center build-outs require sustained regional electricity demand assessment rather than nameplate capacity alone.', kind: 'fact', domain: 'ai-power', mechanism: 'data_center_load', entities: [{ kind: 'industry', name: 'AI infrastructure' }, { kind: 'industry', name: 'Data centers' }], confidence: 75, materiality: 78, novelty: 70,
    },
    {
      title: 'Firm capacity and generation source packet', canonicalUrl: 'https://www.eia.gov/electricity/', publisher: 'U.S. Energy Information Administration', sourceTier: 'regulatory', body: 'Source packet queued for firm-capacity and dispatchability evidence.', publishedAt: now,
      assertion: 'The ability to serve large, continuous load depends on deliverable firm capacity, not aggregate nameplate generation alone.', kind: 'fact', domain: 'ai-power', mechanism: 'firm_capacity_constraint', entities: [{ kind: 'industry', name: 'Electric power generation' }], confidence: 76, materiality: 82, novelty: 64,
    },
    {
      title: 'PJM interconnection source packet', canonicalUrl: 'https://www.pjm.com/planning/services-requests/interconnection-queues', publisher: 'PJM Interconnection', sourceTier: 'regulatory', body: 'Source packet queued for interconnection queue and transmission timing evidence.', publishedAt: now,
      assertion: 'Interconnection timing can delay otherwise announced generation and load-serving capacity in constrained regions.', kind: 'fact', domain: 'ai-power', mechanism: 'interconnection_constraint', entities: [{ kind: 'regulator', name: 'PJM Interconnection' }], confidence: 78, materiality: 80, novelty: 68,
    },
    {
      title: 'Grid equipment supply source packet', canonicalUrl: 'https://www.energy.gov/', publisher: 'U.S. Department of Energy', sourceTier: 'regulatory', body: 'Source packet queued for transformer, switchgear, and turbine supply-chain evidence.', publishedAt: now,
      assertion: 'Long lead-time electrical equipment can slow the conversion of announced power investment into deliverable capacity.', kind: 'fact', domain: 'ai-power', mechanism: 'equipment_lead_time', entities: [{ kind: 'industry', name: 'Electrical equipment' }], confidence: 72, materiality: 74, novelty: 62,
    },
  ]
  for (const source of sources) await ingestWorldObservation(source)
  const hypothesis = await correlateAiPowerHypothesis(ownerId)
  const thesis = await promoteEligibleMarketHypothesis(ownerId)
  return { observations: sources.length, hypothesis, thesis }
}

export async function runMarketWorldCycle(): Promise<{ baselineId: string; hypotheses: number; promoted: number }> {
  const baseline = await compileWorldBaseline('global', 'global')
  const supabase = getSupabaseClient()!
  const { data: owners, error } = await supabase.from('market_users').select('id').limit(20)
  if (error) throw new Error(`Unable to load market thesis owners: ${error.message}`)
  let hypotheses = 0
  let promoted = 0
  for (const owner of owners ?? []) {
    const hypothesis = await correlateAiPowerHypothesis(owner.id)
    if (hypothesis) hypotheses += 1
    if (isMarketAutoThesisEnabled()) {
      const thesis = await promoteEligibleMarketHypothesis(owner.id)
      if (thesis) promoted += 1
    }
  }
  return { baselineId: baseline.id, hypotheses, promoted }
}

export function isMarketWorldModelEnabled(environment: NodeJS.ProcessEnv = process.env): boolean {
  return environment.MARKET_WORLD_MODEL_ENABLED === 'true'
}

export function isMarketAutoThesisEnabled(environment: NodeJS.ProcessEnv = process.env): boolean {
  return environment.MARKET_AUTO_THESIS_ENABLED === 'true'
}
