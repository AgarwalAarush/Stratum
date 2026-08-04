import type { WorldSourceContract, WorldSourceHealthCheck, WorldSourceHealthStatus, WorldSourceRegistryEntry } from '../markets/types.ts'
import { fetchWorldSourceControlWorkspace, resolveApprovedWorldSource } from './world-source-control.ts'
import { getSupabaseClient } from './supabase.ts'

const HEALTH_TIMEOUT_MS = 15_000
// Several public authorities reject HEAD (or route it differently) while
// allowing a bounded GET. Treat those method-specific results as inconclusive,
// not as a source outage; the GET still validates the active contract.
const FALLBACK_HEAD_STATUSES = new Set([403, 405, 501, 503])
const SOURCE_HEALTH_HEADERS = {
  'User-Agent': 'StratumMarketMemory/1.0 (+private research worker)',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.7',
}

export interface WorldSourceHealthProbe {
  status: WorldSourceHealthStatus
  canonicalUrl: string
  resolvedUrl: string | null
  httpStatus: number | null
  mimeType: string | null
  latencyMs: number | null
  error: string | null
}

function allowedUrl(contract: WorldSourceContract, value: string): boolean {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:') return false
    const hostAllowed = contract.allowedHosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))
    return hostAllowed && (contract.allowedPaths.length === 0 || contract.allowedPaths.some((path) => url.pathname.startsWith(path)))
  } catch {
    return false
  }
}

function allowedMime(contract: WorldSourceContract, mimeType: string | null): boolean | null {
  if (contract.acceptedMimeTypes.length === 0) return true
  if (!mimeType) return null
  return contract.acceptedMimeTypes.some((accepted) => mimeType.toLowerCase().startsWith(accepted.toLowerCase()))
}

async function healthResponse(fetchImpl: typeof fetch, canonicalUrl: string, signal: AbortSignal): Promise<Response> {
  let response = await fetchImpl(canonicalUrl, { method: 'HEAD', redirect: 'follow', signal, headers: SOURCE_HEALTH_HEADERS })
  if (FALLBACK_HEAD_STATUSES.has(response.status)) {
    response = await fetchImpl(canonicalUrl, {
      method: 'GET', redirect: 'follow', signal,
      headers: { ...SOURCE_HEALTH_HEADERS, Range: 'bytes=0-1024' },
    })
  }
  return response
}

/**
 * A probe validates reachability and contract shape only. It never decides
 * whether a source is authoritative and never changes source admission.
 */
export async function probeWorldSourceHealth(
  source: Pick<WorldSourceRegistryEntry, 'canonicalUrl'>,
  contract: WorldSourceContract,
  options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<WorldSourceHealthProbe> {
  const startedAt = Date.now()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? HEALTH_TIMEOUT_MS)
  try {
    const response = await healthResponse(options.fetchImpl ?? fetch, source.canonicalUrl, controller.signal)
    const resolvedUrl = response.url || source.canonicalUrl
    const mimeType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() || null
    const latencyMs = Date.now() - startedAt
    if (!response.ok) {
      return { status: 'failed', canonicalUrl: source.canonicalUrl, resolvedUrl, httpStatus: response.status, mimeType, latencyMs, error: `HTTP ${response.status}` }
    }
    if (!allowedUrl(contract, resolvedUrl)) {
      return { status: 'failed', canonicalUrl: source.canonicalUrl, resolvedUrl, httpStatus: response.status, mimeType, latencyMs, error: 'Resolved URL is outside the active source contract' }
    }
    const mimeAllowed = allowedMime(contract, mimeType)
    if (mimeAllowed === false) {
      return { status: 'failed', canonicalUrl: source.canonicalUrl, resolvedUrl, httpStatus: response.status, mimeType, latencyMs, error: 'Response MIME type is outside the active source contract' }
    }
    if (mimeAllowed === null) {
      return { status: 'degraded', canonicalUrl: source.canonicalUrl, resolvedUrl, httpStatus: response.status, mimeType, latencyMs, error: 'Response did not provide a MIME type' }
    }
    return { status: 'healthy', canonicalUrl: source.canonicalUrl, resolvedUrl, httpStatus: response.status, mimeType, latencyMs, error: null }
  } catch (error) {
    const timedOut = controller.signal.aborted
    return {
      status: 'failed', canonicalUrl: source.canonicalUrl, resolvedUrl: null, httpStatus: null, mimeType: null,
      latencyMs: Date.now() - startedAt, error: timedOut ? 'Source health probe timed out' : (error instanceof Error ? error.message : String(error)),
    }
  } finally {
    clearTimeout(timeout)
  }
}

function activeSource(source: WorldSourceRegistryEntry): boolean {
  return source.status === 'approved' || source.status === 'probation'
}

function candidateProbeContract(source: Pick<WorldSourceRegistryEntry, 'id' | 'canonicalUrl'>): WorldSourceContract {
  const url = new URL(source.canonicalUrl)
  return {
    id: `candidate-preflight:${source.id}`,
    sourceId: source.id,
    version: 0,
    status: 'active',
    allowedHosts: [url.hostname],
    // A candidate preflight should establish that the proposed *direct* target
    // is reachable. It must not silently validate the rest of a host.
    allowedPaths: url.pathname === '/' ? [] : [url.pathname],
    acceptedMimeTypes: [],
    cadence: 'event',
    assertionsAllowed: [],
    retentionDays: null,
    notes: 'Temporary candidate reachability boundary; not an admitted source contract.',
    createdAt: new Date(0).toISOString(),
  }
}

async function persistHealthCheck(sourceId: string, probe: WorldSourceHealthProbe): Promise<WorldSourceHealthCheck> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const { data, error } = await supabase.from('world_source_health_checks').insert({
    source_id: sourceId, status: probe.status, canonical_url: probe.canonicalUrl, resolved_url: probe.resolvedUrl,
    http_status: probe.httpStatus, mime_type: probe.mimeType, latency_ms: probe.latencyMs, error: probe.error,
  }).select('*').single()
  if (error || !data) throw new Error(`Unable to persist source health check: ${error?.message ?? 'unknown error'}`)
  return {
    id: String(data.id), sourceId: String(data.source_id), status: data.status as WorldSourceHealthStatus,
    canonicalUrl: String(data.canonical_url), resolvedUrl: data.resolved_url === null ? null : String(data.resolved_url),
    httpStatus: data.http_status === null ? null : Number(data.http_status), mimeType: data.mime_type === null ? null : String(data.mime_type),
    latencyMs: data.latency_ms === null ? null : Number(data.latency_ms), error: data.error === null ? null : String(data.error), checkedAt: String(data.checked_at),
  }
}

/**
 * Verify a candidate's exact direct URL on the worker before a human admits
 * it. This records only operational telemetry; it cannot approve, block, or
 * collect the source. The reviewer still supplies and owns the final contract.
 */
export async function preflightWorldSourceCandidate(slug: string): Promise<WorldSourceHealthCheck> {
  const workspace = await fetchWorldSourceControlWorkspace()
  const source = workspace.sources.find((item) => item.slug === slug)
  if (!source) throw new Error(`Unknown source ${slug}`)
  if (source.status !== 'candidate') throw new Error(`Only candidate sources can be preflighted (received ${source.status})`)
  const probe = await probeWorldSourceHealth(source, candidateProbeContract(source))
  return persistHealthCheck(source.id, probe)
}

export interface WorldSourceHealthAudit {
  checks: WorldSourceHealthCheck[]
  healthy: number
  degraded: number
  failed: number
}

/** Worker-only audit. Bounded concurrency keeps routine health checks polite. */
export async function auditWorldSourceHealth(options: { fetchImpl?: typeof fetch; concurrency?: number } = {}): Promise<WorldSourceHealthAudit> {
  const workspace = await fetchWorldSourceControlWorkspace()
  const sources = workspace.sources.filter(activeSource)
  const concurrency = Math.max(1, Math.min(8, Math.floor(options.concurrency ?? 4)))
  const checks: WorldSourceHealthCheck[] = []
  let cursor = 0
  const worker = async () => {
    while (cursor < sources.length) {
      const source = sources[cursor++]
      if (!source) return
      const { contract } = await resolveApprovedWorldSource(source.slug, source.canonicalUrl)
      const probe = await probeWorldSourceHealth(source, contract, { fetchImpl: options.fetchImpl })
      checks.push(await persistHealthCheck(source.id, probe))
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, sources.length) }, () => worker()))
  return {
    checks,
    healthy: checks.filter((check) => check.status === 'healthy').length,
    degraded: checks.filter((check) => check.status === 'degraded').length,
    failed: checks.filter((check) => check.status === 'failed').length,
  }
}
