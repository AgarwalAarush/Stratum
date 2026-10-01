import { createHash } from 'node:crypto'
import type {
  MarketHypothesis,
  MarketHypothesisEvidence,
  MarketResearchFrontierItem,
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
import { fetchActiveMarketDomainPacks, isMarketDomainActive, resolveApprovedWorldSource } from './world-source-control.ts'
import { getMarketDomainPack } from '../markets/domain-packs.ts'
import { predictionDeadlineFromHorizon } from './market-prediction-evaluation.ts'

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
  evidenceRole?: 'reference_context' | 'release_observation'
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
  const documentPayload = {
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
  }
  const { data: insertedDocument, error: documentError } = await supabase.from('world_documents').upsert(
    documentPayload, { onConflict: 'content_hash', ignoreDuplicates: true },
  ).select('*').maybeSingle()
  let documentRow = insertedDocument
  if (!documentRow && !documentError) {
    const { data: existingDocument, error: existingDocumentError } = await supabase.from('world_documents').select('*').eq('content_hash', stored.contentHash).maybeSingle()
    if (existingDocumentError) throw new Error(`Unable to resolve immutable world document: ${existingDocumentError.message}`)
    documentRow = existingDocument
  }
  if (documentError || !documentRow) throw new Error(`Unable to persist world document: ${documentError?.message ?? 'unknown error'}`)

  const entityIds = await resolveEntities(input.entities ?? [])
  const fingerprint = observationFingerprint(input, stored.contentHash)
  const observationPayload = {
    document_id: documentRow.id,
    assertion: input.assertion.trim(),
    observation_kind: input.kind,
    domain: input.domain.trim(),
    mechanism: input.mechanism.trim(),
    geography: input.geography?.trim() || null,
    metadata: { evidenceRole: input.evidenceRole ?? 'release_observation' },
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
  }
  const { data: insertedObservation, error: observationError } = await supabase.from('world_observations').upsert(
    observationPayload, { onConflict: 'fingerprint', ignoreDuplicates: true },
  ).select('*').maybeSingle()
  let observationRow = insertedObservation
  if (!observationRow && !observationError) {
    const { data: existingObservation, error: existingObservationError } = await supabase.from('world_observations').select('*').eq('fingerprint', fingerprint).maybeSingle()
    if (existingObservationError) throw new Error(`Unable to resolve immutable world observation: ${existingObservationError.message}`)
    observationRow = existingObservation
  }
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
  const now = new Date().toISOString()
  const markdown = baselineMarkdown(scopeType, scopeKey, content)
  return { id: `computed:${scopeType}:${scopeKey}`, scopeType, scopeKey, version: Number(current?.version ?? 0), content, markdown,
    observationIds: observations.map(item => item.id), sourceIds: observations.map(item => item.documentId), diff,
    dataAsOf: observations[0]?.ingestedAt ?? now, generatedAt: now, freshness: observations.length ? 'fresh' : 'stale' }

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

function normalizeResearchFrontier(row: RecordValue): MarketResearchFrontierItem {
  const status = row.status
  return {
    id: String(row.id), hypothesisId: String(row.hypothesis_id), researchVersionId: row.research_version_id === null ? null : String(row.research_version_id ?? ''),
    question: String(row.question ?? ''), causalNode: String(row.causal_node ?? ''), priority: number(row.priority), sourceTypes: strings(row.source_types),
    adapterId: row.adapter_id === null ? null : String(row.adapter_id ?? ''),
    status: (status === 'evidence_received' || status === 'complete' || status === 'blocked' || status === 'deferred' ? status : 'queued') as MarketResearchFrontierItem['status'],
    evidenceNeeded: String(row.evidence_needed ?? ''), attemptCount: number(row.attempt_count), lastError: row.last_error === null ? null : String(row.last_error ?? ''),
    nextRunAt: row.next_run_at === null ? null : String(row.next_run_at ?? ''), createdAt: String(row.created_at),
  }
}

function normalizeCrossDomainLink(row: RecordValue): import('../markets/types.ts').MarketHypothesisCrossDomainLink {
  const status = row.status
  if (status !== 'forming' && status !== 'active' && status !== 'archived') throw new Error(`Invalid persisted cross-domain link status: ${String(status)}`)
  const relationship = row.relationship
  if (relationship !== 'amplifies' && relationship !== 'constrains' && relationship !== 'transmits') throw new Error(`Invalid persisted cross-domain relationship: ${String(relationship)}`)
  return {
    id: String(row.id), ownerId: String(row.owner_id), fromHypothesisId: String(row.from_hypothesis_id), toHypothesisId: String(row.to_hypothesis_id),
    linkId: String(row.link_id), relationship, explanation: String(row.explanation), sourceObservationIds: strings(row.source_observation_ids),
    confidence: number(row.confidence), status, createdAt: String(row.created_at), updatedAt: String(row.updated_at),
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

export async function correlateDomainHypothesis(ownerId: string, domainId: string): Promise<MarketHypothesis | null> {
  throw new Error('Unsupported capability: legacy belief writer retired; use Git World investigation')
}

/** Shared deterministic entry gate for every declared market domain. */
export function minimumMechanismsForDomainHypothesis(domainId: string): number {
  const pack = getMarketDomainPack(domainId)
  if (!pack) throw new Error(`Unknown market domain: ${domainId}`)
  return Math.max(2, Math.min(3, pack.mechanisms.filter((mechanism) => mechanism.required).length))
}

/** Backward-compatible entry point for the first active domain pack. */
export async function correlateAiPowerHypothesis(ownerId: string): Promise<MarketHypothesis | null> {
  return correlateDomainHypothesis(ownerId, 'ai-power')
}

/**
 * Cross-domain links preserve a transmission mechanism between two already
 * formed hypotheses. They do not merge evidence, promote either thesis, or
 * manufacture an exposure. Each side must remain independently sourced.
 */
export async function correlateCrossDomainHypotheses(ownerId: string): Promise<number> {
  throw new Error('Unsupported capability: legacy belief writer retired; use Git World investigation')
}

export interface HypothesisPromotionEvidence {
  causalNode: string
  sourceTier: WorldSourceTier
  observedAt: string | null
  publisher?: string | null
}

/** Prefer the freshest provenance timestamp so annual/regulatory releases
 * remain eligible after recent governed ingestion even when the document
 * publication date is older than the promotion window. */
export function promotionEvidenceFreshnessAt(item: HypothesisPromotionEvidence): number | null {
  if (!item.observedAt) return null
  const parsed = Date.parse(item.observedAt)
  return Number.isFinite(parsed) ? parsed : null
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
  // Explicitly unresolved nodes are research gaps, not promotion blockers.
  // Economic capture is always optional at this gate; other unresolved nodes
  // are similarly exempt from the official-evidence requirement.
  const factualCore = core.filter((mechanism) => mechanism !== 'economic_capture' && !hypothesis.unresolvedNodes.includes(mechanism))
  const freshCutoff = now.getTime() - 180 * 24 * 60 * 60 * 1_000
  const fresh = evidence.filter((item) => (promotionEvidenceFreshnessAt(item) ?? 0) >= freshCutoff)
  const supportedByNode = new Set(fresh
    .filter((item) => item.sourceTier === 'primary' || item.sourceTier === 'regulatory' || item.sourceTier === 'independent')
    .map((item) => item.causalNode))
  const independentCrossCheck = fresh.some((item) => item.sourceTier === 'independent')
  // Primary company disclosures can corroborate when an independent pack is
  // not yet admitted; require a distinct non-official publisher via primary.
  const primaryCrossCheck = fresh.some((item) => item.sourceTier === 'primary')
  // Macro/policy packs are often entirely regulatory. Distinct publishers in
  // the official ledger count as the independent-style cross-check there.
  const officialPublishers = new Set(
    fresh
      .filter((item) => item.sourceTier === 'primary' || item.sourceTier === 'regulatory')
      .map((item) => (item.publisher ?? '').trim().toLowerCase())
      .filter(Boolean),
  )
  const multiPublisherOfficialCrossCheck = officialPublishers.size >= 2
  return hypothesis.confidence >= 65
    && factualCore.every((mechanism) => supportedByNode.has(mechanism))
    && (independentCrossCheck || primaryCrossCheck || multiPublisherOfficialCrossCheck)
    && hypothesis.unresolvedNodes.length <= 1
}

export async function promoteEligibleMarketHypothesis(ownerId: string, hypothesisId?: string): Promise<MarketThesisVersion | null> {
  throw new Error('Unsupported capability: legacy belief writer retired; use Git World investigation')
}

function normalizeThesis(
  row: RecordValue,
  predictionRows: RecordValue[],
  exposureRows: RecordValue[],
  latestEvaluations = new Map<string, import('../markets/types.ts').MarketThesisPredictionEvaluation>(),
  linkedCompanyTheses: import('../markets/types.ts').MarketLinkedCompanyThesis[] = [],
): MarketThesisVersion {
  const content = record(row.content)
  const economicCapture = record(content.economicCapture)
  return {
    id: String(row.id), hypothesisId: String(row.hypothesis_id), version: number(row.version), state: row.state as MarketThesisVersion['state'], title: String(row.title),
    content: {
      whyNow: String(content.whyNow ?? ''), economics: String(content.economics ?? ''),
      economicCapture: {
        status: economicCapture.status === 'established' || economicCapture.status === 'plausible' ? economicCapture.status : 'not_established',
        rentRecipients: strings(economicCapture.rentRecipients),
        commoditizedLayers: strings(economicCapture.commoditizedLayers),
        durabilityDrivers: strings(economicCapture.durabilityDrivers),
        breakConditions: strings(economicCapture.breakConditions),
        sourceIds: strings(economicCapture.sourceIds),
      },
      expectations: String(content.expectations ?? ''), falsifiers: strings(content.falsifiers), counterThesis: String(content.counterThesis ?? ''),
      sourceLedger: Array.isArray(content.sourceLedger) ? content.sourceLedger.map(record).map((item) => ({ documentId: String(item.documentId ?? ''), label: String(item.label ?? ''), url: String(item.url ?? ''), tier: item.tier as WorldSourceTier })) : [],
    },
    confidence: number(row.confidence), dataAsOf: String(row.data_as_of), generatedAt: String(row.generated_at), revisionDiff: strings(row.revision_diff), researchVersionId: row.research_version_id === null ? null : String(row.research_version_id ?? ''),
    predictions: predictionRows.map((item): ThesisPrediction => {
      const id = String(item.id)
      return {
        id, prediction: String(item.prediction), expectedDirection: String(item.expected_direction), deadline: iso(item.deadline), evidenceNeeded: String(item.evidence_needed),
        result: item.result as ThesisPrediction['result'], evaluatedAt: iso(item.evaluated_at), latestEvaluation: latestEvaluations.get(id) ?? null,
      }
    }),
    exposures: exposureRows.map((item) => ({
      id: String(item.id), valueChainLayer: String(item.value_chain_layer), entityName: String(item.entity_name), symbol: item.symbol === null ? null : String(item.symbol ?? ''),
      role: item.role as 'beneficiary' | 'loser' | 'substitute', mechanism: String(item.mechanism), materiality: number(item.materiality), confidence: number(item.confidence),
      verificationStatus: item.verification_status as 'verified' | 'needs_company_research' | 'unverified',
      resolutionMethod: item.resolution_method === null || item.resolution_method === undefined ? null : item.resolution_method as import('../markets/types.ts').MarketThesisExposure['resolutionMethod'],
      resolutionReason: item.resolution_reason === null || item.resolution_reason === undefined ? null : String(item.resolution_reason),
      sourceIds: strings(item.source_ids), researchJobId: item.research_job_id === null || item.research_job_id === undefined ? null : String(item.research_job_id),
      researchQueuedAt: item.research_queued_at === null || item.research_queued_at === undefined ? null : String(item.research_queued_at),
    })),
    linkedCompanyTheses,
  }
}

/**
 * Market-thesis versions are immutable. A workspace, however, is a current
 * decision surface: showing every still-active historical revision makes one
 * hypothesis look like several independent live models. Keep the highest
 * version for each hypothesis here, at the read boundary, so the overview and
 * thesis library agree on what is current.
 */
export function selectCurrentMarketThesisVersions(theses: MarketThesisVersion[]): MarketThesisVersion[] {
  const latestByHypothesis = new Map<string, MarketThesisVersion>()
  for (const thesis of theses) {
    const current = latestByHypothesis.get(thesis.hypothesisId)
    if (!current || thesis.version > current.version || (thesis.version === current.version && thesis.generatedAt > current.generatedAt)) {
      latestByHypothesis.set(thesis.hypothesisId, thesis)
    }
  }
  return [...latestByHypothesis.values()].sort((left, right) => right.generatedAt.localeCompare(left.generatedAt))
}

export async function fetchMarketThesisWorkspace(ownerId: string): Promise<MarketThesisWorkspaceData> {
  const supabase = getSupabaseClient()
  if (!supabase) return { baseline: null, hypotheses: [], theses: [], frontiers: [], crossDomainLinks: [] }
  const [baselineRow, hypothesisResult] = await Promise.all([
    compileWorldBaseline('global', 'global'),
    supabase.from('market_hypotheses').select('*').eq('owner_id', ownerId).order('updated_at', { ascending: false }).limit(80),
  ])
  if (hypothesisResult.error) throw new Error(`Unable to load market thesis workspace: ${hypothesisResult.error.message}`)
  const hypothesisIds = (hypothesisResult.data ?? []).map((item) => item.id)
  const thesisResult = hypothesisIds.length > 0
    ? await supabase.from('market_thesis_versions').select('*').in('hypothesis_id', hypothesisIds).order('generated_at', { ascending: false }).limit(80)
    : { data: [], error: null }
  if (thesisResult.error) throw new Error(`Unable to load market thesis workspace: ${thesisResult.error.message}`)
  const thesisIds = (thesisResult.data ?? []).map((item) => item.id)
  const [predictionResult, exposureResult, companyLinkResult] = thesisIds.length > 0 ? await Promise.all([
    supabase.from('market_thesis_predictions').select('*').in('market_thesis_version_id', thesisIds),
    supabase.from('market_thesis_exposures').select('*').in('market_thesis_version_id', thesisIds),
    supabase.from('market_thesis_company_links').select('market_thesis_version_id,investment_theses(id,symbol,version,status,trigger,content,generated_at,reviewed_at,research_note_id)').in('market_thesis_version_id', thesisIds),
  ]) : [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }]
  if (predictionResult.error || exposureResult.error || (companyLinkResult.error && !/market_thesis_company_links|schema cache/i.test(companyLinkResult.error.message))) throw new Error(`Unable to load market thesis details: ${predictionResult.error?.message ?? exposureResult.error?.message ?? companyLinkResult.error?.message}`)
  const predictionIds = (predictionResult.data ?? []).map((item) => String(item.id))
  const predictionEvaluationResult = predictionIds.length > 0
    ? await supabase.from('market_thesis_prediction_evaluations').select('*').in('prediction_id', predictionIds).order('version', { ascending: false })
    : { data: [], error: null }
  if (predictionEvaluationResult.error) throw new Error(`Unable to load market prediction evaluations: ${predictionEvaluationResult.error.message}`)
  const researchResult = hypothesisIds.length > 0
    ? await supabase.from('market_hypothesis_research_versions').select('*').in('hypothesis_id', hypothesisIds).order('version', { ascending: false })
    : { data: [], error: null }
  // Production can briefly be behind the additive migration. Keep the existing
  // thesis workspace readable until that schema and the worker are aligned.
  if (researchResult.error && !/market_hypothesis_research_versions|schema cache/i.test(researchResult.error.message)) {
    throw new Error(`Unable to load market research versions: ${researchResult.error.message}`)
  }
  const frontierResult = hypothesisIds.length > 0
    ? await supabase.from('market_hypothesis_research_frontier').select('*').in('hypothesis_id', hypothesisIds).order('priority', { ascending: false }).limit(120)
    : { data: [], error: null }
  if (frontierResult.error && !/market_hypothesis_research_frontier|schema cache/i.test(frontierResult.error.message)) {
    throw new Error(`Unable to load market research frontiers: ${frontierResult.error.message}`)
  }
  const crossDomainResult = hypothesisIds.length > 0
    ? await supabase.from('market_hypothesis_cross_domain_links').select('*').eq('owner_id', ownerId).order('updated_at', { ascending: false }).limit(80)
    : { data: [], error: null }
  if (crossDomainResult.error && !/market_hypothesis_cross_domain_links|schema cache/i.test(crossDomainResult.error.message)) {
    throw new Error(`Unable to load cross-domain hypothesis links: ${crossDomainResult.error.message}`)
  }
  const predictionsByThesis = new Map<string, RecordValue[]>()
  for (const item of predictionResult.data ?? []) predictionsByThesis.set(item.market_thesis_version_id, [...(predictionsByThesis.get(item.market_thesis_version_id) ?? []), item as RecordValue])
  const exposuresByThesis = new Map<string, RecordValue[]>()
  for (const item of exposureResult.data ?? []) exposuresByThesis.set(item.market_thesis_version_id, [...(exposuresByThesis.get(item.market_thesis_version_id) ?? []), item as RecordValue])
  const companyThesesByMarketVersion = new Map<string, import('../markets/types.ts').MarketLinkedCompanyThesis[]>()
  for (const item of companyLinkResult.data ?? []) {
    const related = (item as RecordValue).investment_theses
    const thesis = Array.isArray(related) ? record(related[0]) : record(related)
    if (!thesis.id) continue
    const content = record(thesis.content)
    const marketVersionId = String((item as RecordValue).market_thesis_version_id)
    const linked: import('../markets/types.ts').MarketLinkedCompanyThesis = {
      id: String(thesis.id), symbol: thesis.symbol === null ? null : String(thesis.symbol ?? ''), version: number(thesis.version),
      status: thesis.status as import('../markets/types.ts').ThesisStatus, headline: String(content.headline ?? ''), trigger: String(thesis.trigger ?? ''),
      generatedAt: String(thesis.generated_at), reviewedAt: thesis.reviewed_at === null ? null : String(thesis.reviewed_at ?? ''),
      researchNoteId: thesis.research_note_id === null ? null : String(thesis.research_note_id ?? ''),
    }
    companyThesesByMarketVersion.set(marketVersionId, [...(companyThesesByMarketVersion.get(marketVersionId) ?? []), linked])
  }
  const latestPredictionEvaluationByPrediction = new Map<string, import('../markets/types.ts').MarketThesisPredictionEvaluation>()
  for (const item of predictionEvaluationResult.data ?? []) {
    const evaluation = {
      id: String(item.id), predictionId: String(item.prediction_id), version: number(item.version), status: item.status as import('../markets/types.ts').MarketThesisPredictionEvaluation['status'],
      verdict: item.verdict as import('../markets/types.ts').MarketThesisPredictionEvaluation['verdict'], rationale: String(item.rationale ?? ''), sourceIds: strings(item.source_ids), observationIds: strings(item.observation_ids),
      provider: item.provider === null ? null : String(item.provider ?? ''), model: item.model === null ? null : String(item.model ?? ''), dataAsOf: String(item.data_as_of),
      generatedAt: item.generated_at === null ? null : String(item.generated_at ?? ''), error: item.error === null ? null : String(item.error ?? ''),
    }
    if (!latestPredictionEvaluationByPrediction.has(evaluation.predictionId)) latestPredictionEvaluationByPrediction.set(evaluation.predictionId, evaluation)
  }
  const latestResearchByHypothesis = new Map<string, import('../markets/types.ts').MarketHypothesisResearchVersion>()
  if (!researchResult.error) {
    const { normalizeResearchVersion } = await import('./market-thesis-research.ts')
    for (const item of researchResult.data ?? []) {
      const normalized = normalizeResearchVersion(item as RecordValue)
      if (!latestResearchByHypothesis.has(normalized.hypothesisId)) latestResearchByHypothesis.set(normalized.hypothesisId, normalized)
    }
  }
  const theses = (thesisResult.data ?? []).map((item) => normalizeThesis(
    item as RecordValue,
    predictionsByThesis.get(item.id) ?? [],
    exposuresByThesis.get(item.id) ?? [],
    latestPredictionEvaluationByPrediction,
    companyThesesByMarketVersion.get(item.id) ?? [],
  ))
  return {
    baseline: baselineRow,
    hypotheses: (hypothesisResult.data ?? []).map((item) => {
      const hypothesis = normalizeHypothesis(item as RecordValue)
      return { ...hypothesis, latestResearch: latestResearchByHypothesis.get(hypothesis.id) ?? null }
    }),
    theses: selectCurrentMarketThesisVersions(theses),
    frontiers: frontierResult.error ? [] : (frontierResult.data ?? []).map((item) => normalizeResearchFrontier(item as RecordValue)),
    crossDomainLinks: crossDomainResult.error ? [] : (crossDomainResult.data ?? [])
      .map((item) => normalizeCrossDomainLink(item as RecordValue))
      .filter((item) => hypothesisIds.includes(item.fromHypothesisId) || hypothesisIds.includes(item.toHypothesisId)),
  }
}

export async function setMarketThesisAction(ownerId: string, hypothesisId: string, action: 'freeze' | 'reject' | 'archive' | 'reactivate'): Promise<void> {
  throw new Error('Unsupported capability: legacy belief writer retired; use Git World investigation')
}

export async function fetchMarketThesisDetail(ownerId: string, hypothesisId: string): Promise<{ hypothesis: MarketHypothesis; theses: MarketThesisVersion[] } | null> {
  const workspace = await fetchMarketThesisWorkspace(ownerId)
  const hypothesis = workspace.hypotheses.find((item) => item.id === hypothesisId)
  if (!hypothesis) return null
  return { hypothesis, theses: workspace.theses.filter((item) => item.hypothesisId === hypothesisId) }
}

/** Test-only fixture data. Production ingestion must archive real source bytes first. */
export async function seedAiPowerDemoObservations(ownerId: string): Promise<{ observations: number; hypothesis: MarketHypothesis | null; thesis: MarketThesisVersion | null }> {
  throw new Error('Unsupported capability: legacy belief writer retired; use Git World investigation')
}

export async function runMarketWorldCycle(options: { baseline?: WorldBaseline } = {}): Promise<{ baselineId: string; hypotheses: number; crossDomainLinks: number; promoted: number }> {
  throw new Error('Unsupported capability: legacy belief writer retired; use Git World investigation')
}

export function isMarketWorldModelEnabled(environment: NodeJS.ProcessEnv = process.env): boolean {
  return environment.MARKET_WORLD_MODEL_ENABLED === 'true'
}

export function isMarketAutoThesisEnabled(environment: NodeJS.ProcessEnv = process.env): boolean {
  return environment.MARKET_AUTO_THESIS_ENABLED === 'true'
}

/**
 * Completing a bounded analyst/critic pass is not itself publication
 * authority. Every asynchronous path must honor the same explicit
 * auto-promotion switch as the scheduled world cycle.
 */
export function shouldAutoPromoteMarketResearch(
  researchStatus: string,
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  return researchStatus === 'complete' && isMarketAutoThesisEnabled(environment)
}
