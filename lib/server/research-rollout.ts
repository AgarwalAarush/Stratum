import { CURRENT_RESEARCH_CONTRACT_VERSION } from '../markets/research-contract.ts'
import {
  RESEARCH_JOB_TYPES, planPortfolioResearchBackfill, researchActiveJobLimit,
  type PortfolioResearchBackfillPlan, type PortfolioResearchHolding,
  type ResearchRolloutJob, type ResearchRolloutReport,
} from '../markets/research-rollout.ts'
import {
  evaluateResearchWorkerReadiness, type ResearchWorkerReadiness, type WorkerReadinessObservation,
} from '../markets/worker-readiness.ts'
import { getSupabaseClient } from './supabase.ts'

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
function text(value: unknown): string | null { return typeof value === 'string' ? value : null }

export async function fetchResearchWorkerReadiness(options: { requiredRelease?: string | null; now?: Date } = {}): Promise<ResearchWorkerReadiness> {
  const db = getSupabaseClient()
  const base = { requiredRelease: options.requiredRelease, requiredContractVersion: CURRENT_RESEARCH_CONTRACT_VERSION, now: options.now }
  if (!db) return evaluateResearchWorkerReadiness({ ...base, database: 'unconfigured', readinessSchema: 'unknown', workers: [] })
  try {
    const rows: Record<string, unknown>[] = []
    const cutoff = new Date((options.now ?? new Date()).getTime() - 180_000).toISOString()
    for (let offset = 0; ; offset += 500) {
      const result = await db.from('worker_heartbeats')
        .select('worker_id,last_seen_at,last_loop_at,release_sha,research_contract_version,health_status,scheduler_enabled,fmp_enabled,codex_enabled')
        .gte('last_seen_at', cutoff).order('worker_id').range(offset, offset + 499).abortSignal(AbortSignal.timeout(15_000))
      if (result.error) {
        const missing = ['42703', 'PGRST204'].includes(result.error.code)
          && /release_sha|research_contract_version|health_status|last_loop_at/.test(result.error.message)
        return evaluateResearchWorkerReadiness({ ...base, database: missing ? 'ready' : 'unreachable', readinessSchema: missing ? 'missing' : 'unknown', workers: [] })
      }
      rows.push(...(result.data ?? []).map(record))
      if ((result.data?.length ?? 0) < 500) break
    }
    const workers: WorkerReadinessObservation[] = rows.map(row => {
      return {
        workerId: String(row.worker_id), lastSeenAt: text(row.last_seen_at), lastLoopAt: text(row.last_loop_at),
        releaseSha: text(row.release_sha), researchContractVersion: typeof row.research_contract_version === 'number' ? row.research_contract_version : null,
        healthStatus: text(row.health_status), schedulerEnabled: row.scheduler_enabled === true,
        fmpEnabled: row.fmp_enabled === true, codexEnabled: row.codex_enabled === true,
      }
    })
    return evaluateResearchWorkerReadiness({ ...base, database: 'ready', readinessSchema: 'current', workers })
  } catch {
    return evaluateResearchWorkerReadiness({ ...base, database: 'unreachable', readinessSchema: 'unknown', workers: [] })
  }
}

/** Fail closed on any input read. A database failure must never look like an empty portfolio. */
export async function fetchPortfolioResearchBackfillPlan(ownerId: string, options: { now?: Date; activeLimit?: number; batchSize?: number } = {}): Promise<PortfolioResearchBackfillPlan> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ownerId)) throw new Error('A valid persisted portfolio owner is required')
  const db = getSupabaseClient()
  if (!db) throw new Error('Database credentials are not configured (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).')
  const [{ fetchAuthoritativePortfolios }, { ETF_SOURCES }] = await Promise.all([import('./portfolio.ts'), import('./etf-research.ts')])
  const portfolios = await fetchAuthoritativePortfolios(ownerId)
  const symbols = [...new Set(portfolios.flatMap(portfolio => portfolio.holdings.filter(holding => holding.quantity > 0).map(holding => holding.symbol)))].sort()
  const { data: assets, error: assetError } = symbols.length
    ? await db.from('market_assets').select('symbol,name').in('symbol', symbols)
    : { data: [], error: null }
  if (assetError) throw new Error('Unable to verify portfolio instrument coverage.')
  const assetsBySymbol = new Map((assets ?? []).map(asset => [String(asset.symbol), String(asset.name ?? '')]))
  const holdings: PortfolioResearchHolding[] = symbols.map(symbol => {
    const isEtf = Boolean(ETF_SOURCES[symbol]) || /\b(?:ETF|index fund|exchange[- ]traded fund)\b/i.test(assetsBySymbol.get(symbol) ?? '')
    const supported = assetsBySymbol.has(symbol) && (!isEtf || Boolean(ETF_SOURCES[symbol]))
    return { ownerId, symbol, instrumentType: isEtf ? 'etf' : 'equity', researchSupported: supported,
      ...(!supported ? { unavailableReason: !assetsBySymbol.has(symbol) ? 'Missing materialized market instrument' : 'Official ETF issuer adapter is not configured' } : {}),
    }
  })
  const reports: ResearchRolloutReport[] = []
  const packetRefs: Array<{ report: ResearchRolloutReport; packetId: string; instrumentType: 'equity' | 'etf' }> = []
  // Page immutable history until every symbol has its latest version. Do not
  // silently omit an older holding when an active symbol has many revisions.
  for (const instrumentType of ['equity', 'etf'] as const) {
    const targetSymbols = holdings.filter(holding => holding.instrumentType === instrumentType).map(holding => holding.symbol)
    if (!targetSymbols.length) continue
    const latest = new Set<string>()
    for (let offset = 0; ; offset += 500) {
      const result = await db.from(instrumentType === 'equity' ? 'equity_research_notes' : 'etf_research_notes')
        .select(`id,symbol,status,content,generated_at,data_as_of,${instrumentType === 'equity' ? 'company_packet_id' : 'etf_research_packet_id'}`).eq('owner_id', ownerId).in('symbol', targetSymbols)
        .order('generated_at', { ascending: false }).order('id').range(offset, offset + 499)
      if (result.error) throw new Error(`Unable to verify ${instrumentType} research output.`)
      const page = result.data ?? []
      for (const raw of page) {
        const row = record(raw), symbol = String(row.symbol)
        if (latest.has(symbol)) continue
        latest.add(symbol)
        const report = { id: String(row.id), ownerId, symbol, instrumentType, status: String(row.status),
          generatedAt: String(row.generated_at), dataAsOf: text(row.data_as_of), content: row.content }
        reports.push(report)
        const packetId = text(row[instrumentType === 'equity' ? 'company_packet_id' : 'etf_research_packet_id'])
        if (!packetId) throw new Error('Research baseline packet is unavailable for contract verification.')
        packetRefs.push({ report, packetId, instrumentType })
      }
      if (page.length < 500 || latest.size === targetSymbols.length) break
    }
  }
  for (const instrumentType of ['equity', 'etf'] as const) {
    const refs = packetRefs.filter(ref => ref.instrumentType === instrumentType)
    for (let offset = 0; offset < refs.length; offset += 100) {
      const batch = refs.slice(offset, offset + 100)
      const result = await db.from(instrumentType === 'equity' ? 'company_packets' : 'etf_research_packets')
        .select('id,packet').eq('owner_id', ownerId).in('id', batch.map(ref => ref.packetId))
      if (result.error) throw new Error('Research baseline packets could not be verified.')
      const packets = new Map((result.data ?? []).map(row => [String(row.id), row.packet]))
      for (const ref of batch) {
        if (!packets.has(ref.packetId)) throw new Error('Research baseline packet is unavailable for contract verification.')
        ref.report.packet = packets.get(ref.packetId)
      }
    }
  }
  const jobs: ResearchRolloutJob[] = []
  for (const terminal of [false, true]) {
    for (let offset = 0; ; offset += 500) {
      let query = db.from('agent_jobs').select('id,payload,status,created_at,dedupe_key,research_retry_count')
        .in('job_type', [...RESEARCH_JOB_TYPES])
        .in('status', terminal ? ['failed', 'blocked', 'cancelled'] : ['queued', 'running'])
      if (terminal) query = query.eq('payload->>ownerId', ownerId).like('dedupe_key', 'portfolio-contract-upgrade:%')
      const result = await query.order('created_at').order('id').range(offset, offset + 499)
      if (result.error) throw new Error('Unable to verify research queue capacity and retry state.')
      const page = result.data ?? []
      jobs.push(...page.map(raw => {
        const row = record(raw), payload = record(row.payload)
        return { id: String(row.id), ownerId: text(payload.ownerId), symbol: text(payload.symbol), status: String(row.status), createdAt: String(row.created_at),
          dedupeKey: text(row.dedupe_key), researchRetryCount: Number(row.research_retry_count ?? 0) }
      }))
      if (page.length < 500) break
    }
  }
  return planPortfolioResearchBackfill({ holdings, reports, jobs, activeLimit: options.activeLimit ?? researchActiveJobLimit(), batchSize: options.batchSize, now: options.now })
}

export interface ResearchBackfillAdmission { symbol: string; id: string | null; deduplicated: boolean; status: string; admitted: boolean }

/** Submit one bounded batch to the durable queue. Rerun after completion until
 * pending work is zero; queueing is never reported as a completed backfill. */
export async function enqueuePortfolioResearchBackfill(ownerId: string, options: { requiredRelease: string; batchSize?: number; dryRun?: boolean; now?: Date }) {
  if (!/^[0-9a-f]{40}$/i.test(options.requiredRelease)) throw new Error('Provide the exact 40-character verified worker release SHA')
  const readiness = await fetchResearchWorkerReadiness({ requiredRelease: options.requiredRelease, now: options.now })
  const plan = readiness.database === 'ready' ? await fetchPortfolioResearchBackfillPlan(ownerId, options) : null
  const admissions: ResearchBackfillAdmission[] = []
  const complete = Boolean(readiness.readyForBackfill && plan && plan.pending.length === 0 && plan.inProgress.length === 0 && plan.unavailable.length === 0 && plan.blocked.length === 0)
  if (options.dryRun || !readiness.readyForBackfill || !plan) return { dryRun: options.dryRun === true, readiness, plan, admissions, complete }
  const db = getSupabaseClient()!
  for (const target of plan.selected) {
    const result = await db.rpc('enqueue_bounded_research_job', {
      p_job_type: target.instrumentType === 'etf' ? 'generate-etf-research' : 'generate-company-research',
      p_payload: { ownerId, symbol: target.symbol, reason: 'portfolio-contract-upgrade',
        requiredWorkerRelease: options.requiredRelease, requiredResearchContractVersion: CURRENT_RESEARCH_CONTRACT_VERSION,
        researchPriority: 'owned', baseResearchId: target.researchId },
      p_dedupe_key: target.dedupeKey, p_active_limit: plan.activeLimit, p_priority: 12,
    })
    if (result.error) throw new Error('Unable to admit bounded portfolio research; migration and queue readiness must be verified.')
    const row = record(Array.isArray(result.data) ? result.data[0] : result.data)
    if (typeof row.admitted !== 'boolean' || typeof row.status !== 'string') throw new Error('Invalid bounded research admission response')
    admissions.push({ symbol: target.symbol, id: text(row.id), deduplicated: row.deduplicated === true, status: row.status, admitted: row.admitted })
    if (!row.admitted && ['capacity', 'worker_not_ready'].includes(row.status)) break
  }
  return { dryRun: false, readiness, plan, admissions,
    complete }
}

export async function fetchResearchOperations(ownerId: string, options: { requiredRelease?: string | null } = {}) {
  const readiness = await fetchResearchWorkerReadiness(options)
  if (readiness.database !== 'ready') return { readiness, portfolio: null, portfolioError: 'Portfolio coverage is unverified because the database is unavailable.' }
  try { return { readiness, portfolio: await fetchPortfolioResearchBackfillPlan(ownerId), portfolioError: null } }
  catch { return { readiness, portfolio: null, portfolioError: 'Portfolio inputs, research outputs or queue capacity could not be verified.' } }
}
