import { getMarketDomainPack, isKnownMarketDomain } from '../markets/domain-packs.ts'
import type {
  MarketDomainPack,
  MarketResearchFrontierItem,
  MarketDomainPackEvent,
  WorldSourceContract,
  WorldSourceControlWorkspaceData,
  WorldSourceDiscoveryRun,
  WorldSourceEvidenceClass,
  WorldSourceHealthCheck,
  WorldSourceHealthStatus,
  WorldSourceKind,
  WorldSourceRegistryEntry,
  WorldSourceScoutCandidate,
  WorldSourceStatus,
  WorldSourceTier,
  WorldObservationProposal,
  WorldObservationProposalTriageRun,
} from '../markets/types.ts'
import { runCodexJson, type CodexExecResult } from './codex-exec.ts'
import { getSupabaseClient } from './supabase.ts'
import { selectMarketModel } from './market-model-policy.ts'

type RecordValue = Record<string, unknown>

const SOURCE_TIERS = new Set<WorldSourceTier>(['primary', 'regulatory', 'independent', 'discovery'])
const SOURCE_KINDS = new Set<WorldSourceKind>(['api', 'rss', 'html', 'pdf', 'dataset', 'filing', 'transcript'])
const EVIDENCE_CLASSES = new Set<WorldSourceEvidenceClass>(['regulatory_data', 'company_disclosure', 'operational_data', 'technical_research', 'industry_research', 'market_expectations', 'discovery'])
const SOURCE_STATUSES = new Set<WorldSourceStatus>(['candidate', 'probation', 'approved', 'blocked', 'retired'])
const SOURCE_HEALTH_STATUSES = new Set<WorldSourceHealthStatus>(['healthy', 'degraded', 'failed'])
const CONTRACT_CADENCES = new Set<WorldSourceContract['cadence']>(['event', 'daily', 'weekly', 'monthly'])
const OBSERVATION_KINDS = new Set(['fact', 'estimate', 'claim', 'inference'])

function record(value: unknown): RecordValue {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {}
}

function relatedRecord(value: unknown): RecordValue {
  return Array.isArray(value) ? record(value[0]) : record(value)
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map((item) => item.trim())
    : []
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Missing ${label}`)
  return value.trim()
}

function integerScore(value: unknown, label: string): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 100) throw new Error(`Invalid ${label}`)
  return parsed
}

function safeHttpsUrl(value: string, label: string): URL {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error(`Invalid ${label} URL`)
  }
  if (url.protocol !== 'https:' || !url.hostname) throw new Error(`${label} URL must use HTTPS`)
  return url
}

/** Search and query portals are navigation tools, not bounded sources. A
 * candidate must identify a stable landing page, feed, dataset, filing, or
 * transcript index that a reviewer can contract without authorizing open-web
 * search. */
function validateScoutCanonicalUrl(value: string): string {
  const url = safeHttpsUrl(value, 'candidate')
  const pathSegments = url.pathname.toLowerCase().split('/').filter(Boolean)
  const searchSegments = new Set(['search', 'searches', 'result', 'results', 'query', 'queries', 'lookup'])
  if (pathSegments.some((segment) => searchSegments.has(segment))) {
    throw new Error('Candidate URL cannot be a search or query portal')
  }
  const searchParameters = new Set(['q', 'query', 'search', 'keyword', 'keywords', 'term'])
  if ([...url.searchParams.keys()].some((key) => searchParameters.has(key.toLowerCase()))) {
    throw new Error('Candidate URL cannot contain a search query')
  }
  return url.toString()
}

function normalizeSlug(value: string): string {
  const slug = value.trim().toLowerCase()
  if (!/^[a-z0-9]+(?:-[a-z0-9]+){0,79}$/.test(slug)) throw new Error('Source slug must be lowercase kebab-case')
  return slug
}

function sourceTierScore(tier: WorldSourceTier): number {
  if (tier === 'primary') return 45
  if (tier === 'regulatory') return 42
  if (tier === 'independent') return 28
  return 10
}

/** A deterministic prior; it never promotes a source by itself. */
export function scoreWorldSourceCandidate(candidate: Pick<WorldSourceScoutCandidate, 'sourceTier' | 'sourceKind' | 'evidenceClasses' | 'limitations'>): number {
  const sourceStructure = candidate.sourceKind === 'api' || candidate.sourceKind === 'dataset' || candidate.sourceKind === 'filing' ? 12 : 7
  const evidenceBreadth = Math.min(18, new Set(candidate.evidenceClasses).size * 6)
  const disclosedLimitations = Math.min(10, candidate.limitations.length * 2)
  return Math.max(0, Math.min(100, sourceTierScore(candidate.sourceTier) + sourceStructure + evidenceBreadth - disclosedLimitations))
}

export function validateWorldSourceScoutCandidates(value: unknown, domainId: string): WorldSourceScoutCandidate[] {
  if (!isKnownMarketDomain(domainId)) throw new Error(`Unknown market domain: ${domainId}`)
  const payload = record(value)
  const rawCandidates = Array.isArray(payload.candidates) ? payload.candidates : []
  if (rawCandidates.length < 1 || rawCandidates.length > 12) throw new Error('Source scout must return 1-12 candidates')
  const seen = new Set<string>()
  return rawCandidates.map((raw) => {
    const item = record(raw)
    const slug = normalizeSlug(requiredString(item.slug, 'candidate slug'))
    if (seen.has(slug)) throw new Error(`Source scout returned duplicate candidate ${slug}`)
    seen.add(slug)
    const canonicalUrl = validateScoutCanonicalUrl(requiredString(item.canonicalUrl, 'candidate'))
    const sourceTier = item.sourceTier as WorldSourceTier
    const sourceKind = item.sourceKind as WorldSourceKind
    if (!SOURCE_TIERS.has(sourceTier)) throw new Error('Invalid source tier')
    if (!SOURCE_KINDS.has(sourceKind)) throw new Error('Invalid source kind')
    const evidenceClasses = strings(item.evidenceClasses) as WorldSourceEvidenceClass[]
    if (evidenceClasses.length < 1 || evidenceClasses.length > 4 || evidenceClasses.some((entry) => !EVIDENCE_CLASSES.has(entry))) {
      throw new Error('Invalid candidate evidence classes')
    }
    const domains = strings(item.domains)
    if (!domains.includes(domainId) || domains.some((entry) => !isKnownMarketDomain(entry))) {
      throw new Error(`Candidate ${slug} domains must include the requested known domain ${domainId}; received ${domains.join(', ') || '(none)'}`)
    }
    const candidate: WorldSourceScoutCandidate = {
      slug,
      label: requiredString(item.label, 'candidate label'),
      publisher: requiredString(item.publisher, 'candidate publisher'),
      canonicalUrl,
      sourceTier,
      sourceKind,
      evidenceClasses: [...new Set(evidenceClasses)],
      domains: [...new Set(domains)],
      coverage: requiredString(item.coverage, 'candidate coverage'),
      whyThisSource: requiredString(item.whyThisSource, 'candidate rationale'),
      limitations: strings(item.limitations).slice(0, 6),
      candidateScore: integerScore(item.candidateScore, 'candidate score'),
    }
    // The agent's score is retained for audit, but admission prioritizes this
    // deterministic prior plus later live-source reliability measurements.
    return candidate
  })
}

export interface WorldSourceContractInput {
  allowedHosts: string[]
  allowedPaths: string[]
  acceptedMimeTypes: string[]
  cadence: WorldSourceContract['cadence']
  assertionsAllowed: string[]
  retentionDays: number | null
  notes: string
}

function normalizedHosts(value: unknown): string[] {
  const hosts = strings(value).map((host) => host.toLowerCase())
  if (hosts.length < 1 || hosts.length > 12) throw new Error('Source contract needs 1-12 allowed hosts')
  if (hosts.some((host) => !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(host) || host.includes('..'))) {
    throw new Error('Source contract has an invalid allowed host')
  }
  return [...new Set(hosts)]
}

export function validateWorldSourceContract(value: unknown): WorldSourceContractInput {
  const input = record(value)
  const cadence = input.cadence as WorldSourceContract['cadence']
  if (!CONTRACT_CADENCES.has(cadence)) throw new Error('Invalid source contract cadence')
  const allowedPaths = strings(input.allowedPaths)
  if (allowedPaths.some((path) => !path.startsWith('/') || path.includes('://') || path.includes('..'))) throw new Error('Source contract has an invalid allowed path')
  const acceptedMimeTypes = strings(input.acceptedMimeTypes).map((type) => type.toLowerCase())
  if (acceptedMimeTypes.some((type) => !/^[a-z0-9.+-]+\/[a-z0-9.+*-]+$/.test(type))) throw new Error('Source contract has an invalid MIME type')
  const assertionsAllowed = strings(input.assertionsAllowed)
  if (assertionsAllowed.length < 1 || assertionsAllowed.some((kind) => !OBSERVATION_KINDS.has(kind))) throw new Error('Source contract has invalid observation kinds')
  const retention = input.retentionDays === null || input.retentionDays === undefined ? null : Number(input.retentionDays)
  if (retention !== null && (!Number.isInteger(retention) || retention < 1 || retention > 36_500)) throw new Error('Invalid source contract retention days')
  return {
    allowedHosts: normalizedHosts(input.allowedHosts), allowedPaths: [...new Set(allowedPaths)], acceptedMimeTypes: [...new Set(acceptedMimeTypes)], cadence,
    assertionsAllowed: [...new Set(assertionsAllowed)], retentionDays: retention, notes: requiredString(input.notes, 'source contract notes'),
  }
}

export function buildWorldSourceScoutPrompt(domainId: string, reason: string): string {
  const domain = getMarketDomainPack(domainId)
  if (!domain) throw new Error(`Unknown market domain: ${domainId}`)
  return [
    'You are Stratum\'s source-scout. Your job is to propose authoritative source-level inputs for a bounded market-research domain. You do not form a market view, extract a thesis, make a recommendation, or approve a source.',
    'Return only direct, stable HTTPS canonical source landing pages, feeds, datasets, filings, or transcript indexes. Do not return search-result pages, search/query portals, article aggregators, social accounts, newsletters, individual market opinions, or URLs you are not confident exist. URLs with /search, /results, /query, /lookup, or search-query parameters are deterministically rejected.',
    'Prefer primary authorities, regulators, statistical agencies, company disclosures, and operational datasets. Independent or discovery sources may fill a clearly stated gap but must disclose limitations. The output is strictly candidate status; it cannot enter the evidence pipeline until a source contract is tested and approved.',
    `DOMAIN: ${JSON.stringify(domain)}`,
    `DOMAIN ASSIGNMENT: Every candidate must set its domains field to include the exact requested domain ID ${JSON.stringify(domain.id)}. Do not substitute a related domain, label, theme, or broader category.`,
    `TRIGGER: ${reason}`,
    'For each candidate, explain which evidence class it covers and the limitation that prevents it from being decisive on its own. Return no more than 12 candidates. Do not fabricate a URL; omit uncertain candidates.',
  ].join('\n\n')
}

function normalizeHealthCheck(row: RecordValue): WorldSourceHealthCheck {
  const status = String(row.status) as WorldSourceHealthStatus
  if (!SOURCE_HEALTH_STATUSES.has(status)) throw new Error(`Invalid persisted source health status: ${status}`)
  return {
    id: String(row.id), sourceId: String(row.source_id), status, canonicalUrl: String(row.canonical_url),
    resolvedUrl: row.resolved_url === null ? null : String(row.resolved_url ?? ''),
    httpStatus: row.http_status === null ? null : Number(row.http_status),
    mimeType: row.mime_type === null ? null : String(row.mime_type ?? ''),
    latencyMs: row.latency_ms === null ? null : Number(row.latency_ms),
    error: row.error === null ? null : String(row.error ?? ''), checkedAt: String(row.checked_at),
  }
}

function normalizeRegistryEntry(row: RecordValue, domainIds: string[] = [], health: WorldSourceHealthCheck | null = null): WorldSourceRegistryEntry {
  const status = String(row.status) as WorldSourceStatus
  if (!SOURCE_STATUSES.has(status)) throw new Error(`Invalid persisted source status: ${status}`)
  const metadata = record(row.metadata)
  const coverage = typeof metadata.coverage === 'string' ? metadata.coverage.trim() : ''
  const whyThisSource = typeof metadata.whyThisSource === 'string' ? metadata.whyThisSource.trim() : ''
  return {
    id: String(row.id), slug: String(row.slug), label: String(row.label), publisher: String(row.publisher), canonicalUrl: String(row.canonical_url),
    sourceTier: String(row.source_tier) as WorldSourceTier, sourceKind: String(row.source_kind) as WorldSourceKind, status,
    evidenceClasses: strings(row.evidence_classes) as WorldSourceEvidenceClass[], discoveredBy: row.discovered_by as WorldSourceRegistryEntry['discoveredBy'],
    discoveryRunId: row.discovery_run_id === null ? null : String(row.discovery_run_id ?? ''), approvedAt: row.approved_at === null ? null : String(row.approved_at ?? ''),
    blockedReason: row.blocked_reason === null ? null : String(row.blocked_reason ?? ''),
    candidateContext: coverage || whyThisSource ? {
      coverage, whyThisSource, limitations: strings(metadata.limitations),
      scoutScore: Number.isFinite(Number(metadata.scoutScore)) ? Number(metadata.scoutScore) : null,
      deterministicScore: Number.isFinite(Number(metadata.deterministicScore)) ? Number(metadata.deterministicScore) : null,
    } : null,
    domainIds: [...new Set(domainIds)].sort(), health,
    createdAt: String(row.created_at), updatedAt: String(row.updated_at),
  }
}

function normalizeContract(row: RecordValue): WorldSourceContract {
  return {
    id: String(row.id), sourceId: String(row.source_id), version: Number(row.version), status: row.status as WorldSourceContract['status'],
    allowedHosts: strings(row.allowed_hosts), allowedPaths: strings(row.allowed_paths), acceptedMimeTypes: strings(row.accepted_mime_types),
    cadence: row.cadence as WorldSourceContract['cadence'], assertionsAllowed: strings(row.assertions_allowed),
    retentionDays: row.retention_days === null ? null : Number(row.retention_days), notes: String(row.notes ?? ''), createdAt: String(row.created_at),
  }
}

async function persistScoutCandidates(runId: string, candidates: WorldSourceScoutCandidate[]): Promise<void> {
  const supabase = getSupabaseClient()!
  for (const candidate of candidates) {
    const { data: existing, error: existingError } = await supabase.from('world_source_registry').select('*').eq('slug', candidate.slug).maybeSingle()
    if (existingError) throw new Error(`Unable to inspect source candidate ${candidate.slug}: ${existingError.message}`)
    let sourceId: string
    if (existing) {
      sourceId = String(existing.id)
    } else {
      const { data, error } = await supabase.from('world_source_registry').insert({
        slug: candidate.slug, label: candidate.label, publisher: candidate.publisher, canonical_url: candidate.canonicalUrl,
        source_tier: candidate.sourceTier, source_kind: candidate.sourceKind, status: 'candidate', evidence_classes: candidate.evidenceClasses,
        discovered_by: 'scout', discovery_run_id: runId, metadata: { coverage: candidate.coverage, whyThisSource: candidate.whyThisSource, limitations: candidate.limitations, scoutScore: candidate.candidateScore, deterministicScore: scoreWorldSourceCandidate(candidate) },
      }).select('id').single()
      if (error || !data) throw new Error(`Unable to persist source candidate ${candidate.slug}: ${error?.message ?? 'unknown error'}`)
      sourceId = String(data.id)
    }
    const domains = candidate.domains.map((domainId) => ({ source_id: sourceId, domain_id: domainId, role: domainId === candidate.domains[0] ? 'core' : 'corroborating' }))
    const { error: domainError } = await supabase.from('world_source_domains').upsert(domains, { onConflict: 'source_id,domain_id', ignoreDuplicates: true })
    if (domainError) throw new Error(`Unable to map source candidate ${candidate.slug} to domains: ${domainError.message}`)
  }
}

export interface RunWorldSourceScoutOptions {
  domainId: string
  reason: string
  trigger?: WorldSourceDiscoveryRun['trigger']
  frontierIds?: string[]
  runner?: (prompt: string) => Promise<CodexExecResult<{ candidates: WorldSourceScoutCandidate[] }>>
}

/**
 * Scout work is low-cost, bounded, and non-authoritative. It may create only
 * `candidate` rows; a separate source-contract/approval operation is required
 * before observations can cite the source.
 */
export async function runWorldSourceScout(options: RunWorldSourceScoutOptions): Promise<WorldSourceDiscoveryRun> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const domain = getMarketDomainPack(options.domainId)
  if (!domain) throw new Error(`Unknown market domain: ${options.domainId}`)
  const now = new Date().toISOString()
  const trigger = options.trigger ?? 'manual'
  const frontierIds = trigger === 'frontier_gap'
    ? [...new Set((options.frontierIds ?? []).filter((id): id is string => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id)))].slice(0, 12)
    : []
  const { data: run, error: createError } = await supabase.from('world_source_discovery_runs').insert({
    domain_id: domain.id, status: 'running', trigger, reason: options.reason, frontier_ids: frontierIds, requested_at: now,
  }).select('*').single()
  if (createError || !run) throw new Error(`Unable to create source-scout run: ${createError?.message ?? 'unknown error'}`)
  try {
    const runner = options.runner ?? ((prompt: string) => runCodexJson({
      prompt,
      schemaPath: 'schemas/world-source-scout.schema.json',
      validate: (value) => ({ candidates: validateWorldSourceScoutCandidates(value, domain.id) }),
      model: selectMarketModel('source_scout').model,
      timeoutMs: 8 * 60 * 1_000,
    }))
    const result = await runner(buildWorldSourceScoutPrompt(domain.id, options.reason))
    const candidates = validateWorldSourceScoutCandidates(result.data, domain.id)
    await persistScoutCandidates(String(run.id), candidates)
    const generatedAt = new Date().toISOString()
    const { data: updated, error: updateError } = await supabase.from('world_source_discovery_runs').update({
      status: 'complete', candidates, provider: result.metadata.provider, model: result.metadata.model, generated_at: generatedAt,
    }).eq('id', run.id).eq('status', 'running').select('*').single()
    if (updateError || !updated) throw new Error(`Unable to publish source-scout run: ${updateError?.message ?? 'unknown error'}`)
    return normalizeDiscoveryRun(updated as RecordValue)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await supabase.from('world_source_discovery_runs').update({ status: 'failed', error: message }).eq('id', run.id)
    throw error
  }
}

function normalizeDiscoveryRun(row: RecordValue): WorldSourceDiscoveryRun {
  const status = row.status as WorldSourceDiscoveryRun['status']
  // A failed run legitimately has the empty default candidate list. It must
  // remain auditable in the control workspace instead of making downstream
  // governed collection fail while trying to render historical telemetry.
  const candidates = status === 'complete' && Array.isArray(row.candidates)
    ? validateWorldSourceScoutCandidates({ candidates: row.candidates }, String(row.domain_id))
    : []
  return {
    id: String(row.id), domainId: String(row.domain_id), status, trigger: row.trigger as WorldSourceDiscoveryRun['trigger'], reason: String(row.reason),
    frontierIds: strings(row.frontier_ids),
    candidates, provider: row.provider === null ? null : String(row.provider ?? ''), model: row.model === null ? null : String(row.model ?? ''),
    generatedAt: row.generated_at === null ? null : String(row.generated_at ?? ''), error: row.error === null ? null : String(row.error ?? ''), createdAt: String(row.created_at),
  }
}

function normalizeObservationProposal(row: RecordValue): WorldObservationProposal {
  const source = relatedRecord(row.world_source_registry)
  const document = relatedRecord(row.world_documents)
  const review = relatedRecord(row.world_observation_proposal_reviews)
  return {
    id: String(row.id), domainId: String(row.domain_id), mechanism: String(row.mechanism), assertion: String(row.assertion),
    kind: row.observation_kind as WorldObservationProposal['kind'], evidenceQuote: String(row.evidence_quote),
    confidence: Number(row.confidence), materiality: Number(row.materiality), novelty: Number(row.novelty),
    sourceLabel: String(source.label ?? document.title ?? 'Governed source'), sourceUrl: String(document.canonical_url ?? source.canonical_url ?? ''), generatedAt: String(row.generated_at),
    review: review.decision === 'accepted' || review.decision === 'rejected' ? { decision: review.decision, rationale: String(review.rationale ?? ''), reviewedAt: String(review.reviewed_at), observationId: review.observation_id === null ? null : String(review.observation_id ?? '') } : null,
  }
}

function normalizeTriageRun(row: RecordValue): WorldObservationProposalTriageRun {
  const capture = relatedRecord(row.world_source_document_captures)
  const source = relatedRecord(capture.world_source_registry)
  const status = String(row.status)
  if (status !== 'succeeded' && status !== 'failed' && status !== 'skipped') throw new Error(`Invalid persisted proposal triage status: ${status}`)
  return {
    id: String(row.id), sourceId: String(capture.source_id), sourceSlug: String(source.slug ?? 'unknown-source'),
    sourceLabel: String(source.label ?? 'Governed source'), sourceUrl: String(source.canonical_url ?? ''), status,
    proposalCount: Number(row.proposal_count ?? 0), provider: row.provider === null ? null : String(row.provider ?? ''),
    model: row.model === null ? null : String(row.model ?? ''), error: row.error === null ? null : String(row.error ?? ''), completedAt: String(row.completed_at),
  }
}

function normalizeResearchFrontier(row: RecordValue): MarketResearchFrontierItem {
  const status = String(row.status)
  if (status !== 'queued' && status !== 'complete' && status !== 'blocked' && status !== 'deferred') throw new Error(`Invalid research frontier status: ${status}`)
  return {
    id: String(row.id), hypothesisId: String(row.hypothesis_id), researchVersionId: row.research_version_id === null ? null : String(row.research_version_id ?? ''),
    question: String(row.question), causalNode: String(row.causal_node), priority: Number(row.priority), sourceTypes: strings(row.source_types), adapterId: row.adapter_id === null ? null : String(row.adapter_id ?? ''),
    status, evidenceNeeded: String(row.evidence_needed), attemptCount: Number(row.attempt_count), lastError: row.last_error === null ? null : String(row.last_error ?? ''),
    nextRunAt: row.next_run_at === null ? null : String(row.next_run_at ?? ''),
  }
}

/** Resolve an already-approved source against its immutable active contract. */
export function validateWorldSourceContractTarget(contract: WorldSourceContract, canonicalUrl: string, mimeType?: string): void {
  const url = safeHttpsUrl(canonicalUrl, 'observation')
  const hostAllowed = contract.allowedHosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))
  if (!hostAllowed) throw new Error(`Source contract does not permit host ${url.hostname}`)
  if (contract.allowedPaths.length > 0 && !contract.allowedPaths.some((path) => url.pathname.startsWith(path))) {
    throw new Error(`Source contract does not permit path ${url.pathname}`)
  }
  if (mimeType && contract.acceptedMimeTypes.length > 0 && !contract.acceptedMimeTypes.some((accepted) => mimeType.toLowerCase().startsWith(accepted.toLowerCase()))) {
    throw new Error(`Source contract does not permit MIME type ${mimeType}`)
  }
}

async function loadApprovedWorldSource(slug: string): Promise<WorldSourceRegistryEntry> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const normalizedSlug = normalizeSlug(slug)
  const { data: sourceRow, error: sourceError } = await supabase.from('world_source_registry').select('*').eq('slug', normalizedSlug).maybeSingle()
  if (sourceError || !sourceRow) throw new Error(`Unknown governed source ${normalizedSlug}`)
  const source = normalizeRegistryEntry(sourceRow as RecordValue)
  if (source.status !== 'approved' && source.status !== 'probation') throw new Error(`Source ${normalizedSlug} is ${source.status}, not approved for ingestion`)
  return source
}

/** Resolve a source against the contract that is active at the time of use. */
export async function resolveApprovedWorldSource(slug: string, canonicalUrl: string, mimeType?: string): Promise<{ source: WorldSourceRegistryEntry; contract: WorldSourceContract }> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const source = await loadApprovedWorldSource(slug)
  const { data: contractRow, error: contractError } = await supabase.from('world_source_contract_versions').select('*').eq('source_id', source.id).eq('status', 'active').order('version', { ascending: false }).limit(1).maybeSingle()
  if (contractError || !contractRow) throw new Error(`Source ${source.slug} has no active source contract`)
  const contract = normalizeContract(contractRow as RecordValue)
  validateWorldSourceContractTarget(contract, canonicalUrl, mimeType)
  return { source, contract }
}

/**
 * Captures retain their governing contract version. Re-checking a historical
 * capture against the newest contract would let a later contract revision
 * silently alter the authority under which evidence is triaged or accepted.
 */
export async function resolveApprovedWorldSourceContractVersion(
  slug: string,
  canonicalUrl: string,
  contractVersion: number,
  mimeType?: string,
): Promise<{ source: WorldSourceRegistryEntry; contract: WorldSourceContract }> {
  if (!Number.isInteger(contractVersion) || contractVersion < 1) throw new Error('A captured source contract version is required')
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const source = await loadApprovedWorldSource(slug)
  const { data: contractRow, error: contractError } = await supabase
    .from('world_source_contract_versions').select('*').eq('source_id', source.id).eq('version', contractVersion).maybeSingle()
  if (contractError || !contractRow) throw new Error(`Source ${source.slug} is missing captured contract version ${contractVersion}`)
  const contract = normalizeContract(contractRow as RecordValue)
  validateWorldSourceContractTarget(contract, canonicalUrl, mimeType)
  return { source, contract }
}

export async function approveWorldSource(slug: string, contractInput: WorldSourceContractInput, approvalReason: string): Promise<WorldSourceRegistryEntry> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const normalizedSlug = normalizeSlug(slug)
  const contract = validateWorldSourceContract(contractInput)
  const reason = requiredString(approvalReason, 'source approval reason')
  const { data: sourceRow, error: sourceError } = await supabase.from('world_source_registry').select('*').eq('slug', normalizedSlug).maybeSingle()
  if (sourceError || !sourceRow) throw new Error(`Unknown source ${normalizedSlug}`)
  const current = normalizeRegistryEntry(sourceRow as RecordValue)
  if (current.status === 'blocked' || current.status === 'retired') throw new Error(`Source ${normalizedSlug} cannot be approved from ${current.status}`)
  const { data, error } = await supabase.rpc('activate_world_source_contract', {
    p_source_id: current.id,
    p_allowed_hosts: contract.allowedHosts,
    p_allowed_paths: contract.allowedPaths,
    p_accepted_mime_types: contract.acceptedMimeTypes,
    p_cadence: contract.cadence,
    p_assertions_allowed: contract.assertionsAllowed,
    p_retention_days: contract.retentionDays,
    p_notes: contract.notes,
    p_approval_reason: reason,
  }).single()
  if (error || !data) throw new Error(`Unable to activate source contract: ${error?.message ?? 'unknown error'}`)
  return normalizeRegistryEntry(data as RecordValue)
}

export async function blockWorldSource(slug: string, reason: string): Promise<void> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const normalizedSlug = normalizeSlug(slug)
  const blockedReason = requiredString(reason, 'source block reason')
  const { error } = await supabase.from('world_source_registry').update({ status: 'blocked', blocked_reason: blockedReason, updated_at: new Date().toISOString() }).eq('slug', normalizedSlug)
  if (error) throw new Error(`Unable to block source ${normalizedSlug}: ${error.message}`)
}

function validMarketUserId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

/** A human may correct an admitted source's direct fetch target only inside
 * its active contract. Cross-host/path changes require a separate contract
 * review rather than silently broadening collection authority. */
export async function reviseWorldSourceCanonicalUrl(input: { slug: string; canonicalUrl: string; rationale: string; reviewerId: string }): Promise<WorldSourceRegistryEntry> {
  if (!validMarketUserId(input.reviewerId)) throw new Error('A persisted authenticated reviewer is required')
  const canonicalUrl = safeHttpsUrl(input.canonicalUrl, 'canonical source').toString()
  const rationale = requiredString(input.rationale, 'canonical revision rationale')
  if (rationale.length > 1_000) throw new Error('Canonical revision rationale exceeds limit')
  const { source } = await resolveApprovedWorldSource(input.slug, canonicalUrl)
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const { data, error } = await supabase.rpc('revise_world_source_canonical_url', {
    p_source_id: source.id, p_reviewer_id: input.reviewerId, p_canonical_url: canonicalUrl, p_rationale: rationale,
  }).single()
  if (error || !data) throw new Error(`Unable to revise source canonical URL: ${error?.message ?? 'unknown error'}`)
  return normalizeRegistryEntry(data as RecordValue)
}

export async function fetchWorldSourceControlWorkspace(): Promise<WorldSourceControlWorkspaceData> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const [domains, sources, runs, mappings, healthChecks, proposals, triageRuns, researchFrontiers] = await Promise.all([
    supabase.from('market_domain_packs').select('*').order('id'),
    supabase.from('world_source_registry').select('*').order('updated_at', { ascending: false }).limit(200),
    supabase.from('world_source_discovery_runs').select('*').order('created_at', { ascending: false }).limit(60),
    supabase.from('world_source_domains').select('source_id,domain_id'),
    supabase.from('world_source_health_checks').select('*').order('checked_at', { ascending: false }).limit(500),
    supabase.from('world_observation_proposals').select('*,world_source_registry(label,canonical_url),world_documents(title,canonical_url),world_observation_proposal_reviews(decision,rationale,reviewed_at,observation_id)').order('generated_at', { ascending: false }).limit(60),
    supabase.from('world_observation_proposal_triage_runs').select('*,world_source_document_captures(source_id,world_source_registry(slug,label,canonical_url))').order('completed_at', { ascending: false }).limit(60),
    supabase.from('market_hypothesis_research_frontier').select('*').order('priority', { ascending: false }).order('created_at', { ascending: false }).limit(120),
  ])
  const error = domains.error ?? sources.error ?? runs.error ?? mappings.error ?? healthChecks.error ?? proposals.error ?? triageRuns.error ?? researchFrontiers.error
  if (error) throw new Error(`Unable to load source-control workspace: ${error.message}`)
  const domainIdsBySourceId = new Map<string, string[]>()
  for (const mapping of mappings.data ?? []) {
    const sourceId = String(mapping.source_id)
    const domainId = String(mapping.domain_id)
    domainIdsBySourceId.set(sourceId, [...(domainIdsBySourceId.get(sourceId) ?? []), domainId])
  }
  const latestHealthBySourceId = new Map<string, WorldSourceHealthCheck>()
  for (const row of healthChecks.data ?? []) {
    const health = normalizeHealthCheck(row as RecordValue)
    if (!latestHealthBySourceId.has(health.sourceId)) latestHealthBySourceId.set(health.sourceId, health)
  }
  return {
    domains: (domains.data ?? []).map((row) => {
      const pack = getMarketDomainPack(String(row.id))
      if (!pack) throw new Error(`Persisted unknown domain pack ${String(row.id)}`)
      const status = String(row.status)
      if (status !== 'candidate' && status !== 'active' && status !== 'archived') throw new Error(`Invalid persisted domain status: ${status}`)
      return { ...pack, status }
    }),
    sources: (sources.data ?? []).map((row) => normalizeRegistryEntry(
      row as RecordValue,
      domainIdsBySourceId.get(String(row.id)) ?? [],
      latestHealthBySourceId.get(String(row.id)) ?? null,
    )),
    discoveryRuns: (runs.data ?? []).map((row) => normalizeDiscoveryRun(row as RecordValue)),
    researchFrontiers: (researchFrontiers.data ?? []).map((row) => normalizeResearchFrontier(row as RecordValue)),
    observationProposals: (proposals.data ?? []).map((row) => normalizeObservationProposal(row as RecordValue)),
    triageRuns: (triageRuns.data ?? []).map((row) => normalizeTriageRun(row as RecordValue)),
  }
}

function sourceRecord(value: unknown): { id: string; status: string; evidenceClasses: string[] } | null {
  const row = record(value)
  return typeof row.id === 'string' ? { id: row.id, status: String(row.status), evidenceClasses: strings(row.evidence_classes) } : null
}

export async function fetchActiveMarketDomainPacks(): Promise<MarketDomainPack[]> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const { data, error } = await supabase.from('market_domain_packs').select('id').eq('status', 'active').order('id')
  if (error) throw new Error(`Unable to load active market domains: ${error.message}`)
  return (data ?? []).flatMap((row) => {
    const pack = getMarketDomainPack(String(row.id))
    return pack ? [pack] : []
  })
}

export async function isMarketDomainActive(domainId: string): Promise<boolean> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const { data, error } = await supabase.from('market_domain_packs').select('status').eq('id', domainId).maybeSingle()
  if (error || !data) throw new Error(`Unable to load domain ${domainId}: ${error?.message ?? 'unknown error'}`)
  return data.status === 'active'
}

export async function activateMarketDomainPack(domainId: string, reason: string): Promise<MarketDomainPackEvent> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const pack = getMarketDomainPack(domainId)
  if (!pack) throw new Error(`Unknown market domain: ${domainId}`)
  const activationReason = requiredString(reason, 'domain activation reason')
  const { data: domainRow, error: domainError } = await supabase.from('market_domain_packs').select('status').eq('id', domainId).maybeSingle()
  if (domainError || !domainRow) throw new Error(`Unable to load domain ${domainId}: ${domainError?.message ?? 'unknown error'}`)
  if (domainRow.status === 'archived') throw new Error(`Archived domain ${domainId} cannot be activated`)
  const { data: mappings, error: sourceError } = await supabase
    .from('world_source_domains')
    .select('source_id,world_source_registry(id,status,evidence_classes)')
    .eq('domain_id', domainId)
  if (sourceError) throw new Error(`Unable to inspect domain source coverage: ${sourceError.message}`)
  const approved = (mappings ?? []).flatMap((mapping) => {
    const source = sourceRecord(mapping.world_source_registry)
    return source && (source.status === 'approved' || source.status === 'probation') ? [source] : []
  })
  for (const requirement of pack.sourceRequirements) {
    const matching = new Set(approved.filter((source) => source.evidenceClasses.includes(requirement.evidenceClass)).map((source) => source.id))
    if (matching.size < requirement.minimumSources) {
      throw new Error(`${domainId} needs ${requirement.minimumSources} approved ${requirement.evidenceClass} source${requirement.minimumSources === 1 ? '' : 's'} before activation`)
    }
  }
  const sourceIds = [...new Set(approved.map((source) => source.id))]
  const { error: updateError } = await supabase.from('market_domain_packs').update({ status: 'active', updated_at: new Date().toISOString() }).eq('id', domainId)
  if (updateError) throw new Error(`Unable to activate domain ${domainId}: ${updateError.message}`)
  const { data: event, error: eventError } = await supabase.from('market_domain_pack_events').insert({ domain_id: domainId, action: 'activated', reason: activationReason, source_ids: sourceIds }).select('*').single()
  if (eventError || !event) throw new Error(`Domain ${domainId} was activated but activation event failed: ${eventError?.message ?? 'unknown error'}`)
  return { id: String(event.id), domainId: String(event.domain_id), action: 'activated', reason: String(event.reason), sourceIds: strings(event.source_ids), createdAt: String(event.created_at) }
}
