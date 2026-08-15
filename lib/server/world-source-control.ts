import { getMarketDomainPack, isKnownMarketDomain, MARKET_DOMAIN_PACKS } from '../markets/domain-packs.ts'
import type {
  MarketDomainPack,
  MarketDomainResearchCoverage,
  MarketResearchScoutLead,
  MarketResearchScoutRun,
  MarketOrchestrationAction,
  MarketOrchestrationRun,
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
import { fetchWorldSourceReferrals } from './intelligence-source-referrals.ts'
import { buildDomainDecisionCoverage, evaluateDomainAdmission, type PortfolioDomainSignal } from '../markets/domain-admission.ts'

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

function validateWorldSourceScoutCandidatesInternal(value: unknown, domainId: string, allowHistoricalSearchPortals: boolean): WorldSourceScoutCandidate[] {
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
    const canonicalUrl = allowHistoricalSearchPortals
      ? safeHttpsUrl(requiredString(item.canonicalUrl, 'candidate'), 'candidate').toString()
      : validateScoutCanonicalUrl(requiredString(item.canonicalUrl, 'candidate'))
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

/** Strict write-time admission validation for every new scout output. */
export function validateWorldSourceScoutCandidates(value: unknown, domainId: string): WorldSourceScoutCandidate[] {
  return validateWorldSourceScoutCandidatesInternal(value, domainId, false)
}

/** Historical runs are immutable audit artifacts. They may contain a URL that
 * predates a later admission rule, but never grant the candidate authority to
 * enter evidence; reviewers can explicitly block the linked candidate row. */
export function validatePersistedWorldSourceScoutCandidates(value: unknown, domainId: string): WorldSourceScoutCandidate[] {
  return validateWorldSourceScoutCandidatesInternal(value, domainId, true)
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
 * A scout can create candidate records, never source authority. Direct-target
 * preflight is a separate, low-risk operational check that makes review
 * faster; it must never be scheduled for a source that is already approved,
 * blocked, or retired.
 */
export function selectCandidateSourcePreflights(
  candidateSlugs: readonly string[],
  sources: ReadonlyArray<Pick<WorldSourceRegistryEntry, 'slug' | 'status'>>,
  limit = 12,
): string[] {
  const candidateSet = new Set(sources.filter((source) => source.status === 'candidate').map((source) => source.slug))
  const selected: string[] = []
  for (const value of candidateSlugs) {
    const slug = value.trim().toLowerCase()
    if (!slug || !candidateSet.has(slug) || selected.includes(slug)) continue
    selected.push(slug)
    if (selected.length >= Math.max(1, Math.min(limit, 12))) break
  }
  return selected
}

/** Load only the just-scouted rows that remain eligible for a candidate probe. */
export async function findCandidateSourcePreflights(candidateSlugs: readonly string[], limit = 12): Promise<string[]> {
  const normalized = [...new Set(candidateSlugs.map((value) => value.trim().toLowerCase()).filter(Boolean))].slice(0, 24)
  if (normalized.length === 0) return []
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const { data, error } = await supabase.from('world_source_registry').select('slug,status').in('slug', normalized)
  if (error) throw new Error(`Unable to inspect source candidates for preflight: ${error.message}`)
  const sources = (data ?? []).map((row) => ({ slug: String(row.slug), status: row.status as WorldSourceStatus }))
  return selectCandidateSourcePreflights(normalized, sources, limit)
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
    ? validatePersistedWorldSourceScoutCandidates({ candidates: row.candidates }, String(row.domain_id))
    : []
  return {
    id: String(row.id), domainId: String(row.domain_id), status, trigger: row.trigger as WorldSourceDiscoveryRun['trigger'], reason: String(row.reason),
    frontierIds: strings(row.frontier_ids),
    candidates, provider: row.provider === null ? null : String(row.provider ?? ''), model: row.model === null ? null : String(row.model ?? ''),
    generatedAt: row.generated_at === null ? null : String(row.generated_at ?? ''), error: row.error === null ? null : String(row.error ?? ''), createdAt: String(row.created_at),
  }
}

function normalizeResearchScoutLead(value: unknown): MarketResearchScoutLead | null {
  const lead = record(value)
  const supports = lead.supports
  if (typeof lead.title !== 'string' || typeof lead.publisher !== 'string' || typeof lead.url !== 'string' || typeof lead.sourceType !== 'string' || typeof lead.claim !== 'string' || typeof lead.evidenceQuote !== 'string') return null
  if (supports !== 'supports' && supports !== 'contradicts' && supports !== 'context') return null
  return { title: lead.title, publisher: lead.publisher, url: lead.url, sourceType: lead.sourceType, claim: lead.claim, evidenceQuote: lead.evidenceQuote, supports, limitations: strings(lead.limitations), recurringSourceCandidate: Boolean(lead.recurringSourceCandidate) }
}

function normalizeResearchScoutRun(row: RecordValue): MarketResearchScoutRun {
  const status = String(row.status)
  if (status !== 'running' && status !== 'complete' && status !== 'failed') throw new Error(`Invalid persisted broad research-scout status: ${status}`)
  const trigger = row.trigger === 'frontier_gap' || row.trigger === 'manual' ? row.trigger : 'manual'
  return { id: String(row.id), domainId: String(row.domain_id), status, trigger, reason: String(row.reason), frontierIds: strings(row.frontier_ids), leads: (Array.isArray(row.leads) ? row.leads : []).flatMap((entry) => { const lead = normalizeResearchScoutLead(entry); return lead ? [lead] : [] }), unresolvedQuestions: strings(row.unresolved_questions), provider: row.provider === null ? null : String(row.provider ?? ''), model: row.model === null ? null : String(row.model ?? ''), generatedAt: row.generated_at === null ? null : String(row.generated_at ?? ''), error: row.error === null ? null : String(row.error ?? ''), createdAt: String(row.created_at) }
}

function normalizeOrchestrationRun(row: RecordValue): MarketOrchestrationRun {
  const status = String(row.status)
  if (status !== 'running' && status !== 'complete' && status !== 'failed') throw new Error(`Invalid orchestration run status: ${status}`)
  const trigger = row.trigger === 'manual' ? 'manual' : 'scheduled'
  return {
    id: String(row.id), status, trigger, marketRegime: row.market_regime === null ? null : String(row.market_regime ?? ''),
    inputSummary: record(row.input_summary), createdAt: String(row.created_at),
    completedAt: row.completed_at === null ? null : String(row.completed_at ?? ''), error: row.error === null ? null : String(row.error ?? ''),
  }
}

function normalizeOrchestrationAction(row: RecordValue): MarketOrchestrationAction {
  const actionType = String(row.action_type)
  const state = String(row.state)
  const actionTypes = new Set([
    'investigate_broad', 'investigate_counter_evidence', 'verify_recurring_source', 'critic_revision',
    'collect_known_source', 'evaluate_prediction', 'awaiting_review', 'no_action',
  ])
  const states = new Set(['planned', 'enqueued', 'awaiting_review', 'no_action', 'skipped', 'failed'])
  if (!actionTypes.has(actionType) || !states.has(state)) throw new Error('Invalid persisted orchestration action')
  return {
    id: String(row.id), runId: String(row.run_id), domainId: String(row.domain_id), actionType: actionType as MarketOrchestrationAction['actionType'],
    state: state as MarketOrchestrationAction['state'], priority: Number(row.priority), rationale: String(row.rationale), deterministicSignals: record(row.deterministic_signals),
    jobType: row.job_type === null ? null : String(row.job_type ?? ''), jobId: row.job_id === null ? null : String(row.job_id ?? ''), createdAt: String(row.created_at),
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
    review: review.decision === 'accepted' || review.decision === 'rejected' ? {
      decision: review.decision,
      rationale: String(review.rationale ?? ''),
      reviewedAt: String(review.reviewed_at),
      observationId: review.observation_id === null ? null : String(review.observation_id ?? ''),
      reviewerKind: review.reviewer_kind === 'policy_auto' ? 'policy_auto' : 'human',
    } : null,
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
  if (status !== 'queued' && status !== 'evidence_received' && status !== 'complete' && status !== 'blocked' && status !== 'deferred') throw new Error(`Invalid research frontier status: ${status}`)
  return {
    id: String(row.id), hypothesisId: String(row.hypothesis_id), researchVersionId: row.research_version_id === null ? null : String(row.research_version_id ?? ''),
    question: String(row.question), causalNode: String(row.causal_node), priority: Number(row.priority), sourceTypes: strings(row.source_types), adapterId: row.adapter_id === null ? null : String(row.adapter_id ?? ''),
    status, evidenceNeeded: String(row.evidence_needed), attemptCount: Number(row.attempt_count), lastError: row.last_error === null ? null : String(row.last_error ?? ''),
    nextRunAt: row.next_run_at === null ? null : String(row.next_run_at ?? ''), createdAt: String(row.created_at),
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
  if (current.status === 'candidate') {
    const { data: preflightRow, error: preflightError } = await supabase
      .from('world_source_health_checks')
      .select('*')
      .eq('source_id', current.id)
      .eq('canonical_url', current.canonicalUrl)
      .order('checked_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (preflightError) throw new Error(`Unable to verify candidate preflight: ${preflightError.message}`)
    if (!preflightRow) throw new Error(`Source ${normalizedSlug} needs a successful worker preflight before approval`)
    const preflight = normalizeHealthCheck(preflightRow as RecordValue)
    if (preflight.status !== 'healthy') throw new Error(`Source ${normalizedSlug} needs a healthy worker preflight before approval`)
    if (new Date(preflight.checkedAt).getTime() < new Date(current.updatedAt).getTime()) {
      throw new Error(`Source ${normalizedSlug} needs a preflight after its latest candidate update`)
    }
    validateWorldSourceContractTarget(contract as WorldSourceContract, preflight.resolvedUrl ?? preflight.canonicalUrl, preflight.mimeType ?? undefined)
  }
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

export async function fetchWorldSourceControlWorkspace(ownerId?: string): Promise<WorldSourceControlWorkspaceData> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const [domains, sources, runs, researchScoutRuns, mappings, healthChecks, proposals, triageRuns, researchFrontiers, orchestrationRuns, orchestrationActions, referrals, observations] = await Promise.all([
    supabase.from('market_domain_packs').select('*').order('id'),
    supabase.from('world_source_registry').select('*').order('updated_at', { ascending: false }).limit(200),
    supabase.from('world_source_discovery_runs').select('*').order('created_at', { ascending: false }).limit(60),
    supabase.from('market_research_scout_runs').select('*').order('created_at', { ascending: false }).limit(40),
    supabase.from('world_source_domains').select('source_id,domain_id'),
    supabase.from('world_source_health_checks').select('*').order('checked_at', { ascending: false }).limit(500),
    supabase.from('world_observation_proposals').select('*,world_source_registry(label,canonical_url),world_documents(title,canonical_url),world_observation_proposal_reviews(decision,rationale,reviewed_at,observation_id,reviewer_kind)').order('generated_at', { ascending: false }).limit(60),
    supabase.from('world_observation_proposal_triage_runs').select('*,world_source_document_captures(source_id,world_source_registry(slug,label,canonical_url))').order('completed_at', { ascending: false }).limit(60),
    supabase.from('market_hypothesis_research_frontier').select('*,market_hypotheses(scope)').order('priority', { ascending: false }).order('created_at', { ascending: false }).limit(120),
    supabase.from('market_orchestration_runs').select('*').order('created_at', { ascending: false }).limit(20),
    supabase.from('market_orchestration_actions').select('*').order('created_at', { ascending: false }).limit(120),
    fetchWorldSourceReferrals(),
    supabase.from('world_observations').select('domain,ingested_at').order('ingested_at', { ascending: false }).limit(2_000),
  ])
  const error = domains.error ?? sources.error ?? runs.error ?? researchScoutRuns.error ?? mappings.error ?? healthChecks.error ?? proposals.error ?? triageRuns.error ?? researchFrontiers.error ?? orchestrationRuns.error ?? orchestrationActions.error ?? observations.error
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
  const normalizedSources = (sources.data ?? []).map((row) => normalizeRegistryEntry(
    row as RecordValue,
    domainIdsBySourceId.get(String(row.id)) ?? [],
    latestHealthBySourceId.get(String(row.id)) ?? null,
  ))
  const coverage = (domains.data ?? []).map((row) => {
    const domainId = String(row.id)
    const domain = getMarketDomainPack(domainId)
    if (!domain) throw new Error(`Persisted unknown domain pack ${domainId}`)
    const domainSources = normalizedSources.filter((source) => source.domainIds.includes(domainId))
    const domainObservations = (observations.data ?? []).filter((observation) => observation.domain === domainId)
    const domainFrontiers = (researchFrontiers.data ?? []).filter((frontier) => {
      const hypothesis = relatedRecord((frontier as RecordValue).market_hypotheses)
      return String(hypothesis.scope ?? '') === domainId
    }).map((frontier) => normalizeResearchFrontier(frontier as RecordValue))
    return buildMarketDomainResearchCoverage({
      domain,
      sources: domainSources,
      referrals: referrals.filter((referral) => referral.domainId === domainId),
      observations: domainObservations.map((observation) => ({ ingestedAt: String(observation.ingested_at) })),
      frontiers: domainFrontiers,
      proposals: (proposals.data ?? []).filter((proposal) => String(proposal.domain_id) === domainId).map((proposal) => normalizeObservationProposal(proposal as RecordValue)),
    })
  })
  const normalizedDomains: MarketDomainPack[] = (domains.data ?? []).map((row) => {
    const pack = getMarketDomainPack(String(row.id))
    if (!pack) throw new Error(`Persisted unknown domain pack ${String(row.id)}`)
    const status = String(row.status)
    if (status !== 'candidate' && status !== 'active' && status !== 'archived') throw new Error(`Invalid persisted domain status: ${status}`)
    return { ...pack, status: status as MarketDomainPack['status'] }
  })
  let portfolioSignals: PortfolioDomainSignal[] = []
  if (ownerId && validMarketUserId(ownerId)) {
    const [{ data: transactionRows }, { data: watchlistRows }, { data: thesisRows }, { data: leadershipSnapshot }] = await Promise.all([
      supabase.from('portfolio_transactions').select('symbol,action,quantity').eq('owner_id', ownerId).is('voided_at', null),
      supabase.from('market_watchlists').select('market_watchlist_items(symbol)').eq('owner_id', ownerId),
      supabase.from('investment_theses').select('symbol').eq('owner_id', ownerId).eq('entity_type', 'stock').eq('status', 'accepted').not('symbol', 'is', null),
      supabase.from('market_leadership_snapshots').select('id').eq('status', 'complete').eq('is_latest', true).maybeSingle(),
    ])
    const ownedQuantities = new Map<string, number>()
    for (const row of transactionRows ?? []) {
      if (!row.symbol) continue
      const direction = row.action === 'sell' ? -1 : row.action === 'buy' || row.action === 'position_import' ? 1 : 0
      ownedQuantities.set(String(row.symbol), (ownedQuantities.get(String(row.symbol)) ?? 0) + direction * Number(row.quantity ?? 0))
    }
    const watchlisted = new Set((watchlistRows ?? []).flatMap((row) => (row.market_watchlist_items ?? []).map((item: { symbol: string }) => item.symbol)))
    const accepted = new Set((thesisRows ?? []).map((row) => String(row.symbol)))
    const symbols = [...new Set([...ownedQuantities.keys(), ...watchlisted, ...accepted])]
    const { data: metricRows } = leadershipSnapshot && symbols.length
      ? await supabase.from('market_stock_metrics').select('symbol,sector,sub_industry').eq('snapshot_id', leadershipSnapshot.id).in('symbol', symbols)
      : { data: [] }
    const classifications = new Map((metricRows ?? []).map((row) => [String(row.symbol), { sector: String(row.sector ?? ''), subIndustry: String(row.sub_industry ?? '') }]))
    portfolioSignals = symbols.map((symbol) => ({
      symbol,
      sector: classifications.get(symbol)?.sector ?? '',
      subIndustry: classifications.get(symbol)?.subIndustry ?? '',
      owned: (ownedQuantities.get(symbol) ?? 0) > 0.00000001,
      watchlisted: watchlisted.has(symbol),
      acceptedThesis: accepted.has(symbol),
    }))
  }
  const normalizedFrontiers = (researchFrontiers.data ?? []).map((row) => normalizeResearchFrontier(row as RecordValue))
  const frontierDomainIds = new Map((researchFrontiers.data ?? []).map((row) => [String(row.id), String(relatedRecord((row as RecordValue).market_hypotheses).scope ?? '')]))
  const decisionCoverage = buildDomainDecisionCoverage({ domains: normalizedDomains, portfolioSignals, frontiers: normalizedFrontiers, frontierDomainIds })
  return {
    domains: normalizedDomains,
    sources: normalizedSources,
    discoveryRuns: (runs.data ?? []).map((row) => normalizeDiscoveryRun(row as RecordValue)),
    researchScoutRuns: (researchScoutRuns.data ?? []).map((row) => normalizeResearchScoutRun(row as RecordValue)),
    researchFrontiers: normalizedFrontiers,
    observationProposals: (proposals.data ?? []).map((row) => normalizeObservationProposal(row as RecordValue)),
    triageRuns: (triageRuns.data ?? []).map((row) => normalizeTriageRun(row as RecordValue)),
    orchestrationRuns: (orchestrationRuns.data ?? []).map((row) => normalizeOrchestrationRun(row as RecordValue)),
    orchestrationActions: (orchestrationActions.data ?? []).map((row) => normalizeOrchestrationAction(row as RecordValue)),
    referrals,
    coverage,
    decisionCoverage,
  }
}

const OBSERVATION_FRESHNESS_SLO_DAYS = 14
const FRONTIER_AGE_SLO_DAYS = 21

function ageInDays(value: string | null, now: Date): number | null {
  if (!value) return null
  const timestamp = new Date(value).getTime()
  if (!Number.isFinite(timestamp)) return null
  return Math.max(0, Math.floor((now.getTime() - timestamp) / 86_400_000))
}

/** Build the visible research-control contract for one domain. All thresholds
 * are deterministic operational SLOs, not judgments about thesis validity. */
export function buildMarketDomainResearchCoverage(input: {
  domain: MarketDomainPack
  sources: WorldSourceRegistryEntry[]
  referrals: import('../markets/types.ts').WorldSourceReferral[]
  observations: Array<{ ingestedAt: string }>
  frontiers: MarketResearchFrontierItem[]
  proposals: WorldObservationProposal[]
  now?: Date
}): MarketDomainResearchCoverage {
  const now = input.now ?? new Date()
  const admitted = input.sources.filter((source) => source.status === 'approved' || source.status === 'probation')
  const sourceClassCoverage = input.domain.sourceRequirements.map((requirement) => ({
    evidenceClass: requirement.evidenceClass,
    current: new Set(admitted.filter((source) => source.evidenceClasses.includes(requirement.evidenceClass)).map((source) => source.id)).size,
    required: requirement.minimumSources,
    purpose: requirement.purpose,
  }))
  const openFrontiers = input.frontiers.filter((frontier) => frontier.status !== 'complete')
  const oldestOpenFrontierAt = openFrontiers.flatMap((frontier) => frontier.createdAt ? [frontier.createdAt] : []).sort()[0] ?? null
  const latestObservationAt = input.observations.map((observation) => observation.ingestedAt).sort().at(-1) ?? null
  const observationFreshnessDays = ageInDays(latestObservationAt, now)
  const frontierAgeDays = ageInDays(oldestOpenFrontierAt, now)
  const candidateSourceCount = input.sources.filter((source) => source.status === 'candidate').length
  const pendingReferralCount = input.referrals.filter((referral) => referral.status === 'pending').length
  const pendingProposalCount = input.proposals.filter((proposal) => !proposal.review).length
  const reviewBacklogCount = candidateSourceCount + pendingReferralCount + pendingProposalCount
  const explanations: string[] = []
  const missingClasses = sourceClassCoverage.filter((entry) => entry.current < entry.required)
  if (missingClasses.length) explanations.push(`Source coverage is short in ${missingClasses.map((entry) => `${entry.evidenceClass.replaceAll('_', ' ')} (${entry.current}/${entry.required})`).join(', ')}.`)
  if (latestObservationAt === null) explanations.push('No governed observation has been admitted for this domain yet.')
  else if (observationFreshnessDays !== null && observationFreshnessDays > OBSERVATION_FRESHNESS_SLO_DAYS) explanations.push(`Latest governed evidence is ${observationFreshnessDays} days old; the operating target is ${OBSERVATION_FRESHNESS_SLO_DAYS} days.`)
  if (frontierAgeDays !== null && frontierAgeDays > FRONTIER_AGE_SLO_DAYS) explanations.push(`The oldest unresolved research question is ${frontierAgeDays} days old; the operating target is ${FRONTIER_AGE_SLO_DAYS} days.`)
  if (reviewBacklogCount > 0) explanations.push(`${reviewBacklogCount} item${reviewBacklogCount === 1 ? '' : 's'} await source, referral, or quote review before they can advance.`)
  const admittedSourceCount = admitted.length
  const blocked = input.domain.status === 'active' && admittedSourceCount === 0
  const stale = (observationFreshnessDays !== null && observationFreshnessDays > OBSERVATION_FRESHNESS_SLO_DAYS)
    || (frontierAgeDays !== null && frontierAgeDays > FRONTIER_AGE_SLO_DAYS)
  const state: MarketDomainResearchCoverage['state'] = blocked ? 'blocked' : missingClasses.length ? 'thin' : stale ? 'stale' : 'healthy'
  if (explanations.length === 0) explanations.push('Required source classes are covered, governed evidence is within the freshness target, and no review backlog is blocking the domain.')
  return {
    domainId: input.domain.id, state, admittedSourceCount, candidateSourceCount, pendingReferralCount,
    observationCount: input.observations.length, latestObservationAt, observationFreshnessDays, sourceClassCoverage,
    oldestOpenFrontierAt, frontierAgeDays, openFrontierCount: openFrontiers.length, reviewBacklogCount, explanations,
  }
}

type CoverageSource = Pick<WorldSourceRegistryEntry, 'id' | 'status' | 'evidenceClasses'>

function sourceRecord(value: unknown): CoverageSource | null {
  const row = relatedRecord(value)
  const status = String(row.status) as WorldSourceStatus
  const evidenceClasses = strings(row.evidence_classes) as WorldSourceEvidenceClass[]
  return typeof row.id === 'string' && SOURCE_STATUSES.has(status) && evidenceClasses.every((entry) => EVIDENCE_CLASSES.has(entry))
    ? { id: row.id, status, evidenceClasses }
    : null
}

export interface WorldSourceCoverageScoutPlan {
  domainId: string
  reason: string
}

/**
 * Identify only declared evidence-class gaps that have neither admitted nor
 * pending candidate coverage. This keeps scheduled discovery inexpensive and
 * avoids repeatedly searching a domain while its human review queue is full.
 */
export function buildWorldSourceCoverageScoutPlan(
  domain: MarketDomainPack,
  sources: CoverageSource[],
): WorldSourceCoverageScoutPlan | null {
  const gaps = domain.sourceRequirements.flatMap((requirement) => {
    const admitted = new Set(sources
      .filter((source) => (source.status === 'approved' || source.status === 'probation') && source.evidenceClasses.includes(requirement.evidenceClass))
      .map((source) => source.id))
    const candidates = new Set(sources
      .filter((source) => source.status === 'candidate' && source.evidenceClasses.includes(requirement.evidenceClass))
      .map((source) => source.id))
    const missing = requirement.minimumSources - new Set([...admitted, ...candidates]).size
    return missing > 0 ? [{ ...requirement, admitted: admitted.size, candidates: candidates.size, missing }] : []
  })
  if (gaps.length === 0) return null
  const gapSummary = gaps.map((gap) => (
    `${gap.evidenceClass}: ${gap.missing} additional direct candidate source${gap.missing === 1 ? '' : 's'} needed `
      + `(${gap.admitted} admitted, ${gap.candidates} pending candidate; requirement ${gap.minimumSources}).`
  )).join('\n')
  return {
    domainId: domain.id,
    reason: [
      `Weekly bounded coverage review for ${domain.label}.`,
      'Propose direct canonical source candidates only for the declared coverage gaps below. Candidates remain unapproved and cannot ingest, affect a thesis, or activate the domain without separate contract, health, and human approval.',
      gapSummary,
    ].join('\n\n'),
  }
}

/**
 * The source scout explores declared domains on a cadence, not the open
 * internet. It runs only when the registry lacks even candidate-level
 * coverage, so review backlog does not create recurring model spend.
 */
export async function findWorldSourceCoverageScoutPlans(limit = 8): Promise<WorldSourceCoverageScoutPlan[]> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const [domainResult, mappingResult] = await Promise.all([
    supabase.from('market_domain_packs').select('id,status').in('status', ['candidate', 'active']).order('id'),
    supabase.from('world_source_domains').select('domain_id,world_source_registry(id,status,evidence_classes)'),
  ])
  if (domainResult.error || mappingResult.error) {
    throw new Error(`Unable to inspect source coverage: ${domainResult.error?.message ?? mappingResult.error?.message}`)
  }
  const sourcesByDomain = new Map<string, CoverageSource[]>()
  for (const mapping of mappingResult.data ?? []) {
    const source = sourceRecord(mapping.world_source_registry)
    if (!source) continue
    const domainId = String(mapping.domain_id)
    sourcesByDomain.set(domainId, [...(sourcesByDomain.get(domainId) ?? []), source])
  }
  return (domainResult.data ?? []).flatMap((row) => {
    const domain = getMarketDomainPack(String(row.id))
    return domain ? [buildWorldSourceCoverageScoutPlan(domain, sourcesByDomain.get(domain.id) ?? [])] : []
  }).filter((plan): plan is WorldSourceCoverageScoutPlan => plan !== null)
    .slice(0, Math.max(1, Math.min(limit, 12)))
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

/**
 * Code owns a pack's versioned economic definition; the database owns its
 * activation state. This lets a new candidate vertical enter the governed
 * control plane on worker startup without silently reactivating, downgrading,
 * or mutating an already reviewed domain.
 */
export async function ensureDeclaredMarketDomainPacks(): Promise<{ inserted: string[]; upgraded: string[] }> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const { data, error } = await supabase.from('market_domain_packs').select('id,version').in('id', MARKET_DOMAIN_PACKS.map((pack) => pack.id))
  if (error) throw new Error(`Unable to inspect declared market domains: ${error.message}`)
  const persisted = new Map((data ?? []).map((row) => [String(row.id), Number(row.version)]))
  const inserted: string[] = []
  const upgraded: string[] = []
  for (const pack of MARKET_DOMAIN_PACKS) {
    const definition = {
      mechanisms: pack.mechanisms,
      sourceRequirements: pack.sourceRequirements,
      entityKinds: pack.entityKinds,
      hypothesisTemplate: pack.hypothesisTemplate,
      crossDomainLinks: pack.crossDomainLinks,
      admission: pack.admission,
      economicCapture: pack.economicCapture,
    }
    const currentVersion = persisted.get(pack.id)
    if (currentVersion === undefined) {
      const { error: insertError } = await supabase.from('market_domain_packs').insert({
        id: pack.id, version: pack.version, label: pack.label, description: pack.description, status: pack.status,
        parent_domain_id: pack.parentDomainId, definition,
      })
      if (insertError) throw new Error(`Unable to register market domain ${pack.id}: ${insertError.message}`)
      inserted.push(pack.id)
      continue
    }
    if (currentVersion > pack.version) throw new Error(`Persisted market domain ${pack.id} is newer than this worker release`)
    if (currentVersion < pack.version) {
      const { error: updateError } = await supabase.from('market_domain_packs').update({
        version: pack.version, label: pack.label, description: pack.description, parent_domain_id: pack.parentDomainId,
        definition, updated_at: new Date().toISOString(),
      }).eq('id', pack.id).eq('version', currentVersion)
      if (updateError) throw new Error(`Unable to upgrade market domain ${pack.id}: ${updateError.message}`)
      upgraded.push(pack.id)
    }
  }
  return { inserted, upgraded }
}

export async function isMarketDomainActive(domainId: string): Promise<boolean> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const { data, error } = await supabase.from('market_domain_packs').select('status').eq('id', domainId).maybeSingle()
  if (error || !data) throw new Error(`Unable to load domain ${domainId}: ${error?.message ?? 'unknown error'}`)
  return data.status === 'active'
}

export async function activateMarketDomainPack(domainId: string, reason: string, reviewerId: string, maintenanceOwner: string): Promise<MarketDomainPackEvent> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const pack = getMarketDomainPack(domainId)
  if (!pack) throw new Error(`Unknown market domain: ${domainId}`)
  if (!validMarketUserId(reviewerId)) throw new Error('A persisted authenticated reviewer is required')
  const activationReason = requiredString(reason, 'domain activation reason')
  const namedOwner = requiredString(maintenanceOwner, 'domain maintenance owner')
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
  const sourceCoverage = pack.sourceRequirements.map((requirement) => ({
    evidenceClass: requirement.evidenceClass,
    current: new Set(approved.filter((source) => source.evidenceClasses.includes(requirement.evidenceClass)).map((source) => source.id)).size,
    required: requirement.minimumSources,
  }))
  const admission = evaluateDomainAdmission({ domain: pack, sourceCoverage, maintenanceOwner: namedOwner })
  const { error: admissionError } = await supabase.from('market_domain_admission_reviews').insert({
    domain_id: domainId,
    pack_version: pack.version,
    reviewer_id: reviewerId,
    maintenance_owner: namedOwner,
    decision: admission.passed ? 'admitted' : 'rejected',
    rationale: activationReason,
    rubric: admission.criteria,
  })
  if (admissionError) throw new Error(`Unable to persist domain admission review: ${admissionError.message}`)
  if (!admission.passed) {
    const failed = admission.criteria.filter((criterion) => !criterion.passed).map((criterion) => criterion.label).join(', ')
    throw new Error(`${domainId} failed its admission rubric: ${failed}`)
  }
  const sourceIds = [...new Set(approved.map((source) => source.id))]
  const { error: updateError } = await supabase.from('market_domain_packs').update({ status: 'active', updated_at: new Date().toISOString() }).eq('id', domainId)
  if (updateError) throw new Error(`Unable to activate domain ${domainId}: ${updateError.message}`)
  const { data: event, error: eventError } = await supabase.from('market_domain_pack_events').insert({ domain_id: domainId, action: 'activated', reason: activationReason, source_ids: sourceIds }).select('*').single()
  if (eventError || !event) throw new Error(`Domain ${domainId} was activated but activation event failed: ${eventError?.message ?? 'unknown error'}`)
  return { id: String(event.id), domainId: String(event.domain_id), action: 'activated', reason: String(event.reason), sourceIds: strings(event.source_ids), createdAt: String(event.created_at) }
}
