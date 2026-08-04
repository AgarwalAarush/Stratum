import { getMarketDomainPack, isKnownMarketDomain } from '../markets/domain-packs.ts'
import type {
  MarketDomainPack,
  MarketDomainPackEvent,
  WorldSourceContract,
  WorldSourceControlWorkspaceData,
  WorldSourceDiscoveryRun,
  WorldSourceEvidenceClass,
  WorldSourceKind,
  WorldSourceRegistryEntry,
  WorldSourceScoutCandidate,
  WorldSourceStatus,
  WorldSourceTier,
} from '../markets/types.ts'
import { runCodexJson, type CodexExecResult } from './codex-exec.ts'
import { getSupabaseClient } from './supabase.ts'
import { selectMarketModel } from './market-model-policy.ts'

type RecordValue = Record<string, unknown>

const SOURCE_TIERS = new Set<WorldSourceTier>(['primary', 'regulatory', 'independent', 'discovery'])
const SOURCE_KINDS = new Set<WorldSourceKind>(['api', 'rss', 'html', 'pdf', 'dataset', 'filing', 'transcript'])
const EVIDENCE_CLASSES = new Set<WorldSourceEvidenceClass>(['regulatory_data', 'company_disclosure', 'operational_data', 'technical_research', 'industry_research', 'market_expectations', 'discovery'])
const SOURCE_STATUSES = new Set<WorldSourceStatus>(['candidate', 'probation', 'approved', 'blocked', 'retired'])
const CONTRACT_CADENCES = new Set<WorldSourceContract['cadence']>(['event', 'daily', 'weekly', 'monthly'])
const OBSERVATION_KINDS = new Set(['fact', 'estimate', 'claim', 'inference'])

function record(value: unknown): RecordValue {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {}
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
    const canonicalUrl = safeHttpsUrl(requiredString(item.canonicalUrl, 'candidate'), 'candidate').toString()
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
      throw new Error('Candidate domains must include the requested known domain')
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
    'Return only direct, stable HTTPS canonical source landing pages, feeds, datasets, filings, or transcript indexes. Do not return search-result pages, article aggregators, social accounts, newsletters, individual market opinions, or URLs you are not confident exist.',
    'Prefer primary authorities, regulators, statistical agencies, company disclosures, and operational datasets. Independent or discovery sources may fill a clearly stated gap but must disclose limitations. The output is strictly candidate status; it cannot enter the evidence pipeline until a source contract is tested and approved.',
    `DOMAIN: ${JSON.stringify(domain)}`,
    `TRIGGER: ${reason}`,
    'For each candidate, explain which evidence class it covers and the limitation that prevents it from being decisive on its own. Return no more than 12 candidates. Do not fabricate a URL; omit uncertain candidates.',
  ].join('\n\n')
}

function normalizeRegistryEntry(row: RecordValue): WorldSourceRegistryEntry {
  const status = String(row.status) as WorldSourceStatus
  if (!SOURCE_STATUSES.has(status)) throw new Error(`Invalid persisted source status: ${status}`)
  return {
    id: String(row.id), slug: String(row.slug), label: String(row.label), publisher: String(row.publisher), canonicalUrl: String(row.canonical_url),
    sourceTier: String(row.source_tier) as WorldSourceTier, sourceKind: String(row.source_kind) as WorldSourceKind, status,
    evidenceClasses: strings(row.evidence_classes) as WorldSourceEvidenceClass[], discoveredBy: row.discovered_by as WorldSourceRegistryEntry['discoveredBy'],
    discoveryRunId: row.discovery_run_id === null ? null : String(row.discovery_run_id ?? ''), approvedAt: row.approved_at === null ? null : String(row.approved_at ?? ''),
    blockedReason: row.blocked_reason === null ? null : String(row.blocked_reason ?? ''), createdAt: String(row.created_at), updatedAt: String(row.updated_at),
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
  const { data: run, error: createError } = await supabase.from('world_source_discovery_runs').insert({
    domain_id: domain.id, status: 'running', trigger, reason: options.reason, requested_at: now,
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
  const candidates = Array.isArray(row.candidates) ? validateWorldSourceScoutCandidates({ candidates: row.candidates }, String(row.domain_id)) : []
  return {
    id: String(row.id), domainId: String(row.domain_id), status: row.status as WorldSourceDiscoveryRun['status'], trigger: row.trigger as WorldSourceDiscoveryRun['trigger'], reason: String(row.reason),
    candidates, provider: row.provider === null ? null : String(row.provider ?? ''), model: row.model === null ? null : String(row.model ?? ''),
    generatedAt: row.generated_at === null ? null : String(row.generated_at ?? ''), error: row.error === null ? null : String(row.error ?? ''), createdAt: String(row.created_at),
  }
}

/** Resolve an already-approved source against its immutable active contract. */
export async function resolveApprovedWorldSource(slug: string, canonicalUrl: string, mimeType?: string): Promise<{ source: WorldSourceRegistryEntry; contract: WorldSourceContract }> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const normalizedSlug = normalizeSlug(slug)
  const { data: sourceRow, error: sourceError } = await supabase.from('world_source_registry').select('*').eq('slug', normalizedSlug).maybeSingle()
  if (sourceError || !sourceRow) throw new Error(`Unknown governed source ${normalizedSlug}`)
  const source = normalizeRegistryEntry(sourceRow as RecordValue)
  if (source.status !== 'approved' && source.status !== 'probation') throw new Error(`Source ${normalizedSlug} is ${source.status}, not approved for ingestion`)
  const { data: contractRow, error: contractError } = await supabase.from('world_source_contract_versions').select('*').eq('source_id', source.id).eq('status', 'active').order('version', { ascending: false }).limit(1).maybeSingle()
  if (contractError || !contractRow) throw new Error(`Source ${normalizedSlug} has no active source contract`)
  const contract = normalizeContract(contractRow as RecordValue)
  const url = safeHttpsUrl(canonicalUrl, 'observation')
  const hostAllowed = contract.allowedHosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))
  if (!hostAllowed) throw new Error(`Source ${normalizedSlug} contract does not permit host ${url.hostname}`)
  if (contract.allowedPaths.length > 0 && !contract.allowedPaths.some((path) => url.pathname.startsWith(path))) {
    throw new Error(`Source ${normalizedSlug} contract does not permit path ${url.pathname}`)
  }
  if (mimeType && contract.acceptedMimeTypes.length > 0 && !contract.acceptedMimeTypes.some((accepted) => mimeType.toLowerCase().startsWith(accepted.toLowerCase()))) {
    throw new Error(`Source ${normalizedSlug} contract does not permit MIME type ${mimeType}`)
  }
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

export async function fetchWorldSourceControlWorkspace(): Promise<WorldSourceControlWorkspaceData> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const [domains, sources, runs] = await Promise.all([
    supabase.from('market_domain_packs').select('*').order('id'),
    supabase.from('world_source_registry').select('*').order('updated_at', { ascending: false }).limit(200),
    supabase.from('world_source_discovery_runs').select('*').order('created_at', { ascending: false }).limit(60),
  ])
  const error = domains.error ?? sources.error ?? runs.error
  if (error) throw new Error(`Unable to load source-control workspace: ${error.message}`)
  return {
    domains: (domains.data ?? []).map((row) => {
      const pack = getMarketDomainPack(String(row.id))
      if (!pack) throw new Error(`Persisted unknown domain pack ${String(row.id)}`)
      return pack
    }),
    sources: (sources.data ?? []).map((row) => normalizeRegistryEntry(row as RecordValue)),
    discoveryRuns: (runs.data ?? []).map((row) => normalizeDiscoveryRun(row as RecordValue)),
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
