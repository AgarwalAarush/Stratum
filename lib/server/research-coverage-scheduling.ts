import { MARKETS_OWNER_ID } from '../auth/markets-auth.ts'
import { CURRENT_RESEARCH_CONTRACT_VERSION } from '../markets/research-contract.ts'
import { RESEARCH_JOB_TYPES, researchActiveJobLimit } from '../markets/research-rollout.ts'
import { buildResearchCoveragePlan, INTEREST_WATCHLISTS, type CoverageRecord } from '../markets/research-coverage-scheduling.ts'
import { fetchAuthoritativePortfolios } from './portfolio.ts'
import { ETF_SOURCES } from './etf-research.ts'
import { getSupabaseClient } from './supabase.ts'

type Row = Record<string, unknown>
const obj = (value: unknown): Row => value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {}

async function coverageRows(table: string, columns: string, ownerId?: string, allowMissingTable = false): Promise<Row[]> {
  const db = getSupabaseClient()
  if (!db) throw new Error('Research coverage requires Supabase service credentials')
  const rows: Row[] = []
  for (let offset = 0; ; offset += 500) {
    let query = db.from(table).select(columns)
    if (ownerId) query = query.eq('owner_id', ownerId)
    const result = await query.order(table === 'market_research_coverage' ? 'symbol' : 'id').range(offset, offset + 499)
    if (result.error) {
      if (allowMissingTable && ['PGRST205', '42P01'].includes(String(result.error.code))) return []
      throw new Error(`Unable to read research coverage ${table}: ${result.error.message}`)
    }
    const page = result.data as unknown as Row[]
    rows.push(...page)
    if (page.length < 500) break
  }
  return rows
}

/** Seed once, under a DB lock, without rewriting the owner's saved watchlists.
 * The worker performs this work; read requests never enqueue investigation. */
export async function seedInterestWatchlists(ownerId: string): Promise<boolean> {
  if (ownerId !== MARKETS_OWNER_ID) return false
  const db = getSupabaseClient()
  if (!db) throw new Error('Research coverage requires Supabase service credentials')
  const result = await db.rpc('seed_market_interest_watchlists', { p_owner_id: ownerId, p_lists: INTEREST_WATCHLISTS })
  if (result.error) throw new Error(`Unable to seed interest watchlists: ${result.error.message}`)
  return result.data === true
}

export async function fetchResearchCoverageStatus(ownerId: string, cutoff = new Date().toISOString()) {
  const records = (await coverageRows('market_research_coverage', '*', ownerId)).filter(row => row.in_scope !== false)
  const db = getSupabaseClient()!
  const jobIds = [...new Set(records.flatMap(row => typeof row.last_job_id === 'string' ? [row.last_job_id] : []))]
  const jobStatus = new Map<string, string>()
  for (let offset = 0; offset < jobIds.length; offset += 200) {
    const result = await db.from('agent_jobs').select('id,status,payload').in('id', jobIds.slice(offset, offset + 200))
    if (result.error) throw new Error(`Unable to inspect coverage queue status: ${result.error.message}`)
    for (const job of result.data ?? []) if (obj(job.payload).ownerId === ownerId) jobStatus.set(job.id, job.status)
  }
  return records.map(row => {
    const recordedStatus = typeof row.last_queue_status === 'string' ? row.last_queue_status : null
    const queueStatus = ['queued', 'running'].includes(String(recordedStatus)) ? jobStatus.get(String(row.last_job_id)) ?? recordedStatus : recordedStatus
    return {
    symbol: String(row.symbol), priority: String(row.lane),
    lastReviewedAt: typeof row.last_meaningful_review_at === 'string' ? row.last_meaningful_review_at : null,
    selectionReason: typeof row.last_selection_reason === 'string' ? row.last_selection_reason : null,
    nextReviewAt: String(row.next_review_due_at),
    overdue: Date.parse(String(row.next_review_due_at)) <= Date.parse(cutoff),
    queueStatus,
    queued: ['queued', 'running'].includes(String(queueStatus)),
    checkedAt: String(row.updated_at),
    }
  })
}

/** The existing daily portfolio seed job also owns deliberate discovery.
 * Quotas are research jobs, independent of Scout momentum/quality shortlists.
 * Dates are review targets; shortages stay overdue rather than promising a SLA. */
export async function enqueueResearchCoverage(ownerId: string, options: { now?: Date; activeLimit?: number } = {}) {
  const db = getSupabaseClient()
  if (!db) throw new Error('Research coverage requires Supabase service credentials')
  const now = options.now ?? new Date()
  const activeLimit = options.activeLimit ?? researchActiveJobLimit()
  await seedInterestWatchlists(ownerId)
  const [portfolios, watchlists, companyResearch, fundResearch, states, candidates, revalidations, active] = await Promise.all([
    fetchAuthoritativePortfolios(ownerId),
    coverageRows('market_watchlists', 'id,owner_id,name,market_watchlist_items(symbol)', ownerId),
    coverageRows('equity_research_notes', 'id,owner_id,symbol,status,generated_at,content', ownerId),
    coverageRows('etf_research_notes', 'id,owner_id,symbol,status,generated_at,content', ownerId),
    coverageRows('market_research_coverage', '*', ownerId),
    coverageRows('candidate_briefs', 'id,owner_id,symbol,status,generated_at,snoozed_until'),
    coverageRows('research_refresh_checks', 'id,owner_id,symbol,research_note_id,classification,created_at,content', ownerId, true),
    db.from('agent_jobs').select('id,payload,status').in('job_type', [...RESEARCH_JOB_TYPES]).in('status', ['queued', 'running']),
  ])
  if (active.error) throw new Error(`Unable to inspect active research jobs: ${active.error.message}`)
  // Prior releases intentionally froze refresh checks into packets when the
  // separately deployed checks migration was absent. Preserve that evidence
  // path; inaccessible DB reads still fail rather than inventing review dates.
  if (!revalidations.length) {
    const fallbackPackets = await Promise.all([
      coverageRows('company_packets', 'id,owner_id,symbol,research_refresh:packet->researchRefresh', ownerId),
      coverageRows('etf_research_packets', 'id,owner_id,symbol,research_refresh:packet->researchRefresh', ownerId),
    ])
    for (const packet of fallbackPackets.flat()) {
      const refresh = obj(packet.research_refresh)
      if (!Object.keys(refresh).length) continue
      revalidations.push({ owner_id: ownerId, symbol: packet.symbol, research_note_id: refresh.researchNoteId, classification: obj(refresh.decision).kind, created_at: refresh.checkedAt, content: refresh })
    }
  }
  const ownerWatchlists = watchlists.map(list => ({
    ownerId: String(list.owner_id), name: String(list.name),
    symbols: (Array.isArray(list.market_watchlist_items) ? list.market_watchlist_items : []).map(item => String(obj(item).symbol)),
  }))
  const ownedSymbols = portfolios.flatMap(portfolio => portfolio.holdings.filter(holding => holding.quantity > 0).map(holding => holding.symbol))
  const scopedCandidates = candidates.filter(candidate => !candidate.owner_id || candidate.owner_id === ownerId)
  const symbols = [...new Set([...ownedSymbols, ...ownerWatchlists.flatMap(list => list.symbols), ...scopedCandidates.map(candidate => String(candidate.symbol))])]
  const assets: Row[] = []
  for (let start = 0; start < symbols.length; start += 200) {
    const result = await db.from('market_assets').select('symbol,name,status,active,tradable').in('symbol', symbols.slice(start, start + 200))
    if (result.error) throw new Error(`Unable to verify coverage symbols: ${result.error.message}`)
    assets.push(...result.data)
  }
  const isFund = (asset: Row) => Boolean(ETF_SOURCES[String(asset.symbol)]) || /\b(?:ETF|index fund|exchange[- ]traded fund)\b/i.test(String(asset.name ?? ''))
  const verified = assets.filter(asset => asset.active === true && asset.tradable === true && asset.status === 'active' && (!isFund(asset) || Boolean(ETF_SOURCES[String(asset.symbol)])))
  const assetBySymbol = new Map(verified.map(asset => [String(asset.symbol), asset]))
  const plan = buildResearchCoveragePlan({
    ownerId, ownedSymbols, watchlists: ownerWatchlists,
    candidates: scopedCandidates.map(row => ({ ownerId: typeof row.owner_id === 'string' ? row.owner_id : null, symbol: String(row.symbol), status: String(row.status), generatedAt: String(row.generated_at), snoozedUntil: typeof row.snoozed_until === 'string' ? row.snoozed_until : null })),
    research: [...companyResearch, ...fundResearch].map(row => ({ id: String(row.id), ownerId: String(row.owner_id), symbol: String(row.symbol), status: String(row.status), generatedAt: String(row.generated_at), content: row.content })),
    revalidations: revalidations.map(row => ({ ownerId: String(row.owner_id), symbol: String(row.symbol), researchNoteId: String(row.research_note_id), classification: String(row.classification), createdAt: String(row.created_at), content: row.content })),
    states: states.map(row => ({ ownerId: String(row.owner_id), symbol: String(row.symbol), enrolledAt: String(row.enrolled_at), lastSelectedAt: typeof row.last_selected_at === 'string' ? row.last_selected_at : null, selectionReason: typeof row.last_selection_reason === 'string' ? row.last_selection_reason : null })),
    availableSymbols: new Set(assets.map(asset => String(asset.symbol))),
    researchEligibleSymbols: new Set(assetBySymbol.keys()),
    activeSymbols: new Set((active.data ?? []).flatMap(job => {
      const payload = obj(job.payload)
      return payload.ownerId === ownerId && typeof payload.symbol === 'string' ? [payload.symbol] : []
    })),
    directResearchSymbols: ownerId === MARKETS_OWNER_ID ? ['LITE'] : [], now,
    maxTargets: activeLimit,
  })
  const stateBySymbol = new Map(states.map(state => [String(state.symbol), state]))
  const serialize = (record: CoverageRecord) => ({
    owner_id: ownerId, symbol: record.symbol, lane: record.lane, interest_tags: record.interestTags, in_scope: true,
    enrolled_at: record.enrolledAt, last_meaningful_review_at: record.lastMeaningfulReviewAt,
    research_contract_version: CURRENT_RESEARCH_CONTRACT_VERSION,
    next_review_due_at: record.nextReviewDueAt, last_selected_at: record.lastSelectedAt,
    last_selection_reason: record.selectionReason, updated_at: now.toISOString(),
    last_queue_status: assetBySymbol.has(record.symbol)
      ? stateBySymbol.get(record.symbol)?.last_queue_status === 'unavailable_catalog_or_issuer' ? null : stateBySymbol.get(record.symbol)?.last_queue_status ?? null
      : 'unavailable_catalog_or_issuer',
  })
  if (plan.records.length) {
    const persisted = await db.from('market_research_coverage').upsert(plan.records.map(serialize), { onConflict: 'owner_id,symbol' })
    if (persisted.error) throw new Error(`Unable to persist research coverage targets: ${persisted.error.message}`)
  }
  const inScopeSymbols = new Set(plan.records.map(record => record.symbol))
  const retired = states.filter(state => !inScopeSymbols.has(String(state.symbol))).map(state => String(state.symbol))
  for (let start = 0; start < retired.length; start += 200) {
    const result = await db.from('market_research_coverage').update({ in_scope: false }).eq('owner_id', ownerId).in('symbol', retired.slice(start, start + 200))
    if (result.error) throw new Error(`Unable to retire removed coverage names: ${result.error.message}`)
  }
  const queued: Array<{ symbol: string; jobId: string; deduplicated: boolean }> = []
  const capacityBlocked: string[] = []
  for (const target of plan.selected) {
    const asset = assetBySymbol.get(target.symbol)
    const jobType = asset && isFund(asset) ? 'generate-etf-research' : 'generate-company-research'
    const payload = {
      ownerId, symbol: target.symbol, reason: `coverage-review:${now.toISOString().slice(0, 10)}:${target.selectionReason}`,
      coverageLane: target.lane, requiredResearchContractVersion: CURRENT_RESEARCH_CONTRACT_VERSION,
      ...(process.env.STRATUM_RELEASE_SHA ? { requiredWorkerRelease: process.env.STRATUM_RELEASE_SHA } : {}),
    }
    const result = await db.rpc('enqueue_bounded_research_job', {
      p_job_type: jobType, p_payload: payload,
      p_dedupe_key: `coverage-research:v${CURRENT_RESEARCH_CONTRACT_VERSION}:${ownerId}:${target.symbol}:${now.toISOString().slice(0, 10)}`,
      p_active_limit: activeLimit, p_priority: 18,
    })
    if (result.error) throw new Error(`Unable to enqueue deliberate research coverage: ${result.error.message}`)
    const row = obj(Array.isArray(result.data) ? result.data[0] : result.data)
    const admitted = row.admitted === true && typeof row.id === 'string'
    if (admitted) queued.push({ symbol: target.symbol, jobId: String(row.id), deduplicated: row.deduplicated === true })
    else capacityBlocked.push(target.symbol)
    const saved = await db.from('market_research_coverage').update({
      last_queue_status: row.status ?? 'capacity',
      last_selection_reason: target.selectionReason,
      ...(admitted ? { last_selected_at: now.toISOString(), last_job_id: row.id } : {}),
    }).eq('owner_id', ownerId).eq('symbol', target.symbol)
    if (saved.error) throw new Error(`Unable to record coverage admission: ${saved.error.message}`)
  }
  return { ...plan, queued, capacityBlocked }
}
