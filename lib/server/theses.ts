import type {
  CompanyPacket,
  EquityResearchNote,
  InvestmentThesis,
  ThesisContent,
  CompanyThesisMarketContext,
  CompanyThesisResearchSummary,
  CompanyThesisReviewPacket,
  ThesisReviewDecision,
  ThesisReviewOutcome,
  ThesisEntityType,
  ThesisMonitor,
  ThesisMonitorCoverage,
  ThesisMonitorOutcome,
  ThesisMonitorStatus,
  ThesisSource,
  ThesisDecision,
  ThesisStatus,
  ThesisIntakeDraft,
  ThesisWorkspaceData,
} from '../markets/types.ts'
import {
  normalizeThesisContent,
  stockThesisContent,
  thesisEntityKey,
  thesisSources,
  userAuthoredThesisContent,
} from '../markets/theses.ts'
import { fetchLatestMarketLeadership } from './markets-repository.ts'
import { normalizeDecisionForThesisWorkspace } from './portfolio.ts'
import { getSupabaseClient } from './supabase.ts'

function validOwnerId(ownerId: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(ownerId)
}

function thesisStorageUnavailable(message: string | undefined): boolean {
  return Boolean(message && /investment_theses|schema cache/i.test(message))
}

function reviewStorageUnavailable(message: string | undefined): boolean {
  return Boolean(message && /investment_thesis_review_outcomes|schema cache/i.test(message))
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function sources(value: unknown): ThesisSource[] {
  return Array.isArray(value) ? value.flatMap((item) => {
    const source = record(item)
    return typeof source.label === 'string' && typeof source.url === 'string' && typeof source.asOf === 'string'
      ? [{ label: source.label, url: source.url, asOf: source.asOf }]
      : []
  }) : []
}

function relatedRecord(value: unknown): Record<string, unknown> {
  return Array.isArray(value) ? record(value[0]) : record(value)
}

function reviewOutcome(row: Record<string, unknown>): ThesisReviewOutcome | null {
  const decision = row.decision
  if (decision !== 'accept' && decision !== 'reject' && decision !== 'revise' && decision !== 'no_trade') return null
  return {
    id: String(row.id), thesisId: String(row.investment_thesis_id), decision,
    rationale: String(row.rationale ?? ''), reviewedAt: String(row.reviewed_at),
  }
}

function researchSummary(row: Record<string, unknown>): CompanyThesisResearchSummary {
  const content = record(row.content)
  const revision = record(content.revision)
  const changes = Array.isArray(revision.changes) ? revision.changes.map(record) : []
  const opinionChange = String(revision.opinionChange)
  return {
    id: String(row.id), version: Number(row.version), status: row.status as CompanyThesisResearchSummary['status'],
    formalRating: row.formal_rating as CompanyThesisResearchSummary['formalRating'], entryAction: row.entry_action as CompanyThesisResearchSummary['entryAction'],
    fairValue: content.fairValue === null || content.fairValue === undefined || !Number.isFinite(Number(content.fairValue)) ? null : Number(content.fairValue),
    entryZoneLow: content.entryZoneLow === null || content.entryZoneLow === undefined || !Number.isFinite(Number(content.entryZoneLow)) ? null : Number(content.entryZoneLow),
    entryZoneHigh: content.entryZoneHigh === null || content.entryZoneHigh === undefined || !Number.isFinite(Number(content.entryZoneHigh)) ? null : Number(content.entryZoneHigh),
    confidence: Number(content.confidence ?? 0), dataAsOf: String(row.data_as_of),
    revision: {
      priorVersion: revision.priorVersion === null ? null : Number.isFinite(Number(revision.priorVersion)) ? Number(revision.priorVersion) : Number(row.version) > 1 ? Number(row.version) - 1 : null,
      opinionChange: opinionChange === 'more_constructive' || opinionChange === 'less_constructive' || opinionChange === 'unchanged' || opinionChange === 'initial'
        ? opinionChange : Number(row.version) > 1 ? 'unchanged' : 'initial',
      summary: String(revision.summary ?? (Number(row.version) > 1 ? 'Legacy refresh did not include a structured opinion comparison.' : 'Initial research baseline.')),
      changes: changes.flatMap((change) => {
        const field = String(change.field)
        return ['formal_rating', 'entry_action', 'fair_value', 'investment_thesis', 'key_debate', 'kill_criteria', 'evidence'].includes(field)
          ? [{ field: field as CompanyThesisResearchSummary['revision']['changes'][number]['field'], previous: String(change.previous ?? ''), current: String(change.current ?? ''), explanation: String(change.explanation ?? '') }]
          : []
      }),
    },
  }
}

function normalize(row: Record<string, unknown>): InvestmentThesis {
  return {
    id: String(row.id),
    entityType: row.entity_type as ThesisEntityType,
    entityKey: String(row.entity_key),
    symbol: row.symbol === null ? null : String(row.symbol ?? ''),
    sector: row.sector === null ? null : String(row.sector ?? ''),
    subIndustry: row.sub_industry === null ? null : String(row.sub_industry ?? ''),
    version: Number(row.version),
    status: row.status as ThesisStatus,
    trigger: String(row.trigger),
    content: normalizeThesisContent(row.content),
    sources: sources(row.source_refs),
    dataAsOf: String(row.data_as_of),
    generatedAt: String(row.generated_at),
    reviewedAt: row.reviewed_at === null ? null : String(row.reviewed_at ?? ''),
    researchNoteId: row.research_note_id === null ? null : String(row.research_note_id ?? ''),
  }
}

function monitor(row: Record<string, unknown>): ThesisMonitor {
  const stringArray = (value: unknown) =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
  return {
    id: String(row.id),
    thesisId: String(row.thesis_id),
    entityKey: String(row.entity_key),
    status: row.status as ThesisMonitorStatus,
    coverage: stringArray(row.coverage) as ThesisMonitorCoverage[],
    lastCheckedAt: row.last_checked_at === null ? null : String(row.last_checked_at ?? ''),
    lastEvidenceAt: row.last_evidence_at === null ? null : String(row.last_evidence_at ?? ''),
    lastOutcome: row.last_outcome as ThesisMonitorOutcome,
    failureCount: Number(row.failure_count ?? 0),
    lastError: row.last_error === null ? null : String(row.last_error ?? ''),
    updatedAt: String(row.updated_at),
  }
}

interface ProposalInput {
  ownerId: string
  entityType: ThesisEntityType
  symbol?: string
  sector?: string
  subIndustry?: string
  trigger: string
  content: ThesisContent
  sources: ThesisSource[]
  dataAsOf: string
  researchNoteId?: string
  /**
   * A market model can nominate a company for research, but it never supplies
   * the company-level evidence. Retain the originating model version only as
   * traceable context once independent company research has proposed a view.
   */
  marketThesisVersionId?: string
}

async function saveProposal(input: ProposalInput): Promise<InvestmentThesis | null> {
  if (!validOwnerId(input.ownerId)) return null
  const supabase = getSupabaseClient()
  if (!supabase) return null
  const entityKey = thesisEntityKey(input.entityType, input)
  const { data: latest, error: latestError } = await supabase.from('investment_theses')
    .select('id,version,status,content').eq('owner_id', input.ownerId).eq('entity_key', entityKey)
    .order('version', { ascending: false }).limit(1).maybeSingle()
  if (latestError) {
    if (thesisStorageUnavailable(latestError.message)) return null
    throw new Error(`Unable to inspect thesis history: ${latestError.message}`)
  }
  if (latest?.status === 'proposed' && JSON.stringify(latest.content) === JSON.stringify(input.content)) return null
  const { data, error } = await supabase.from('investment_theses').insert({
    owner_id: input.ownerId,
    entity_type: input.entityType,
    entity_key: entityKey,
    symbol: input.symbol?.toUpperCase() ?? null,
    sector: input.sector ?? null,
    sub_industry: input.subIndustry ?? null,
    version: Number(latest?.version ?? 0) + 1,
    status: 'proposed',
    trigger: input.trigger,
    content: input.content,
    source_refs: input.sources,
    data_as_of: input.dataAsOf,
    research_note_id: input.researchNoteId ?? null,
  }).select('*').single()
  if (error || !data) throw new Error(`Unable to save thesis proposal: ${error?.message ?? 'unknown error'}`)
  if (latest?.status === 'proposed' && latest.id) {
    const { error: supersedeError } = await supabase.from('investment_theses').update({
      status: 'superseded',
      reviewed_at: data.generated_at,
    }).eq('id', latest.id).eq('owner_id', input.ownerId).eq('status', 'proposed')
    if (supersedeError) throw new Error(`Unable to supersede the prior proposal: ${supersedeError.message}`)
  }
  return normalize(data)
}

export async function proposeStockThesis(
  ownerId: string,
  packet: CompanyPacket,
  research: EquityResearchNote,
  trigger: string,
  marketThesisVersionId?: string,
): Promise<InvestmentThesis | null> {
  const thesis = await saveProposal({
    ownerId,
    entityType: 'stock',
    symbol: research.symbol,
    sector: packet.industryContext.sector,
    subIndustry: packet.industryContext.subIndustry,
    trigger,
    content: stockThesisContent(research),
    sources: thesisSources(packet, research),
    dataAsOf: research.dataAsOf,
    researchNoteId: research.id,
  })
  if (thesis && marketThesisVersionId) {
    await linkMarketThesisToCompanyThesis(ownerId, marketThesisVersionId, thesis.id)
  }
  return thesis
}

/** Link a completed company-research proposal to the exact market-model
 * version that prompted the investigation. Both records must belong to the
 * same owner; this link is context and never validates the company thesis. */
export async function linkMarketThesisToCompanyThesis(
  ownerId: string,
  marketThesisVersionId: string,
  investmentThesisId: string,
): Promise<void> {
  if (!validOwnerId(ownerId)) throw new Error('A persisted authenticated user is required')
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const [{ data: marketVersion, error: marketError }, { data: companyThesis, error: thesisError }] = await Promise.all([
    supabase.from('market_thesis_versions').select('id,hypothesis_id').eq('id', marketThesisVersionId).maybeSingle(),
    supabase.from('investment_theses').select('id,owner_id').eq('id', investmentThesisId).maybeSingle(),
  ])
  if (marketError || !marketVersion) throw new Error(`Unable to resolve market thesis context: ${marketError?.message ?? 'not found'}`)
  if (thesisError || !companyThesis || companyThesis.owner_id !== ownerId) {
    throw new Error(`Unable to resolve company thesis context: ${thesisError?.message ?? 'not found'}`)
  }
  const { data: hypothesis, error: hypothesisError } = await supabase.from('market_hypotheses')
    .select('id').eq('id', marketVersion.hypothesis_id).eq('owner_id', ownerId).maybeSingle()
  if (hypothesisError || !hypothesis) throw new Error('Market thesis context does not belong to this user')
  const { error } = await supabase.from('market_thesis_company_links').upsert({
    market_thesis_version_id: marketThesisVersionId,
    investment_thesis_id: investmentThesisId,
  }, { onConflict: 'market_thesis_version_id,investment_thesis_id', ignoreDuplicates: true })
  if (error) throw new Error(`Unable to link market and company theses: ${error.message}`)
}

export async function resolveMarketThesisExposureInvestigation(
  ownerId: string,
  hypothesisId: string,
  marketThesisVersionId: string,
  exposureId: string,
): Promise<{ symbol: string; verificationStatus: 'verified' | 'needs_company_research' }> {
  if (!validOwnerId(ownerId)) throw new Error('A persisted authenticated user is required')
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const { data: hypothesis, error: hypothesisError } = await supabase.from('market_hypotheses')
    .select('id').eq('id', hypothesisId).eq('owner_id', ownerId).maybeSingle()
  if (hypothesisError || !hypothesis) throw new Error('Market thesis not found')
  const { data: version, error: versionError } = await supabase.from('market_thesis_versions')
    .select('id,state').eq('id', marketThesisVersionId).eq('hypothesis_id', hypothesisId).maybeSingle()
  if (versionError || !version) throw new Error('Market thesis version not found')
  if (version.state !== 'active' && version.state !== 'weakened') throw new Error('Only published market models can start company research')
  const { data: exposure, error: exposureError } = await supabase.from('market_thesis_exposures')
    .select('symbol,verification_status').eq('id', exposureId).eq('market_thesis_version_id', marketThesisVersionId).maybeSingle()
  if (exposureError || !exposure) throw new Error('Market thesis exposure not found')
  const symbol = typeof exposure.symbol === 'string' ? exposure.symbol.toUpperCase() : ''
  if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol)) throw new Error('This exposure does not yet identify a tradable company')
  if (exposure.verification_status === 'unverified') throw new Error('Verify this exposure before starting company research')
  return {
    symbol,
    verificationStatus: exposure.verification_status as 'verified' | 'needs_company_research',
  }
}

export async function proposeUserAuthoredThesis(
  ownerId: string,
  draft: ThesisIntakeDraft,
): Promise<InvestmentThesis | null> {
  const dataAsOf = new Date().toISOString()
  if (draft.entityType === 'stock') {
    const symbol = draft.symbol?.trim().toUpperCase() ?? ''
    if (!symbol || !/^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol)) throw new Error('Enter a valid stock symbol')
    const leadership = await fetchLatestMarketLeadership()
    const stock = leadership?.stocks.find((item) => item.symbol === symbol)
    const supabase = getSupabaseClient()
    if (!supabase) throw new Error('Supabase service credentials are not configured')
    const { data: asset, error: assetError } = stock
      ? { data: { symbol }, error: null }
      : await supabase.from('market_assets').select('symbol').eq('symbol', symbol)
        .eq('active', true).eq('tradable', true).maybeSingle()
    if (assetError) throw new Error(`Unable to verify ${symbol}: ${assetError.message}`)
    if (!asset) throw new Error(`${symbol} is not recognized as an active tradable U.S. stock`)
    return saveProposal({
      ownerId,
      entityType: 'stock',
      symbol,
      sector: stock?.sector,
      subIndustry: stock?.subIndustry,
      trigger: 'user-authored',
      content: userAuthoredThesisContent({ ...draft, symbol }),
      sources: [],
      dataAsOf,
    })
  }

  const sector = draft.sector?.trim() ?? ''
  const subIndustry = draft.subIndustry?.trim() ?? ''
  if (!sector || !subIndustry) throw new Error('Enter both the sector and industry')
  return saveProposal({
    ownerId,
    entityType: 'sub_industry',
    sector,
    subIndustry,
    trigger: 'user-authored',
    content: userAuthoredThesisContent({ ...draft, sector, subIndustry }),
    sources: [],
    dataAsOf,
  })
}

export async function fetchThesisWorkspace(ownerId: string): Promise<ThesisWorkspaceData> {
  const supabase = getSupabaseClient()
  if (!supabase || !validOwnerId(ownerId)) return { proposals: [], accepted: [], monitors: [], reviewPackets: {} }
  const [{ data, error }, monitorResult] = await Promise.all([
    supabase.from('investment_theses').select('*').eq('owner_id', ownerId)
      .order('generated_at', { ascending: false }).limit(160),
    supabase.from('thesis_monitors').select('*').eq('owner_id', ownerId)
      .order('updated_at', { ascending: false }),
  ])
  if (error) {
    if (thesisStorageUnavailable(error.message)) return { proposals: [], accepted: [], monitors: [], reviewPackets: {} }
    throw new Error(`Unable to load thesis workspace: ${error.message}`)
  }
  if (monitorResult.error && !/thesis_monitors|schema cache/i.test(monitorResult.error.message)) {
    throw new Error(`Unable to load thesis monitors: ${monitorResult.error.message}`)
  }
  const rows = (data ?? []).map((row) => normalize(row))
  const proposals = rows.filter((item) => item.status === 'proposed' && item.trigger !== 'candidate-scout')
  const accepted = [] as InvestmentThesis[]
  const seen = new Set<string>()
  for (const thesis of rows) {
    if (thesis.status !== 'accepted' || seen.has(thesis.entityKey)) continue
    seen.add(thesis.entityKey)
    accepted.push(thesis)
  }
  const thesisIds = rows.map((item) => item.id)
  const researchNoteIds = rows.flatMap((item) => item.researchNoteId ? [item.researchNoteId] : [])
  const [outcomeResult, researchResult, contextResult, decisionResult] = await Promise.all([
    thesisIds.length > 0
      ? supabase.from('investment_thesis_review_outcomes').select('*').eq('owner_id', ownerId).in('investment_thesis_id', thesisIds).order('reviewed_at', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    researchNoteIds.length > 0
      ? supabase.from('equity_research_notes').select('id,version,status,formal_rating,entry_action,content,data_as_of').eq('owner_id', ownerId).in('id', researchNoteIds)
      : Promise.resolve({ data: [], error: null }),
    thesisIds.length > 0
      ? supabase.from('market_thesis_company_links').select('investment_thesis_id,market_thesis_versions(id,title,version,state,confidence,generated_at)').in('investment_thesis_id', thesisIds)
      : Promise.resolve({ data: [], error: null }),
    thesisIds.length > 0
      ? supabase.from('thesis_decisions').select('*').eq('owner_id', ownerId).in('investment_thesis_id', thesisIds).order('created_at', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ])
  if (outcomeResult.error && !reviewStorageUnavailable(outcomeResult.error.message)) throw new Error(`Unable to load thesis review outcomes: ${outcomeResult.error.message}`)
  if (researchResult.error) throw new Error(`Unable to load linked company research: ${researchResult.error.message}`)
  if (contextResult.error && !/market_thesis_company_links|schema cache/i.test(contextResult.error.message)) throw new Error(`Unable to load market-thesis context: ${contextResult.error.message}`)
  if (decisionResult.error && !/investment_thesis_id|thesis_decisions|schema cache/i.test(decisionResult.error.message)) throw new Error(`Unable to load linked capital decisions: ${decisionResult.error.message}`)
  const outcomesByThesisId = new Map<string, ThesisReviewOutcome[]>()
  for (const row of outcomeResult.data ?? []) {
    const outcome = reviewOutcome(row as Record<string, unknown>)
    if (!outcome) continue
    outcomesByThesisId.set(outcome.thesisId, [...(outcomesByThesisId.get(outcome.thesisId) ?? []), outcome])
  }
  const researchById = new Map((researchResult.data ?? []).map((row) => [String(row.id), researchSummary(row as Record<string, unknown>)]))
  const contextsByThesisId = new Map<string, CompanyThesisMarketContext[]>()
  for (const row of contextResult.data ?? []) {
    const version = relatedRecord((row as Record<string, unknown>).market_thesis_versions)
    if (!version.id) continue
    const context: CompanyThesisMarketContext = {
      marketThesisVersionId: String(version.id), title: String(version.title), version: Number(version.version),
      state: version.state as CompanyThesisMarketContext['state'], confidence: Number(version.confidence), generatedAt: String(version.generated_at),
    }
    const thesisId = String((row as Record<string, unknown>).investment_thesis_id)
    contextsByThesisId.set(thesisId, [...(contextsByThesisId.get(thesisId) ?? []), context])
  }
  const decisionsByThesisId = new Map<string, ThesisDecision>()
  for (const row of decisionResult.data ?? []) {
    const thesisId = String((row as Record<string, unknown>).investment_thesis_id ?? '')
    if (!thesisId || decisionsByThesisId.has(thesisId)) continue
    const decision = normalizeDecisionForThesisWorkspace(row as Record<string, unknown>)
    decisionsByThesisId.set(thesisId, decision)
  }
  const reviewPackets = Object.fromEntries(rows.map((thesis): [string, CompanyThesisReviewPacket] => [thesis.id, {
    thesisId: thesis.id, research: thesis.researchNoteId ? researchById.get(thesis.researchNoteId) ?? null : null,
    marketContexts: contextsByThesisId.get(thesis.id) ?? [], sourceLedger: thesis.sources,
    reviewHistory: outcomesByThesisId.get(thesis.id) ?? [],
    capitalDecision: decisionsByThesisId.get(thesis.id) ?? null,
  }]))
  return {
    proposals,
    accepted,
    monitors: (monitorResult.data ?? []).map((row) => monitor(row)),
    reviewPackets,
  }
}

export async function fetchLatestStockThesis(ownerId: string, symbol: string): Promise<InvestmentThesis | null> {
  const supabase = getSupabaseClient()
  if (!supabase || !validOwnerId(ownerId)) return null
  const { data, error } = await supabase.from('investment_theses').select('*').eq('owner_id', ownerId)
    .eq('entity_key', thesisEntityKey('stock', { symbol })).eq('status', 'accepted')
    .order('version', { ascending: false }).limit(1).maybeSingle()
  if (error && !thesisStorageUnavailable(error.message)) throw new Error(`Unable to load stock thesis: ${error.message}`)
  return data ? normalize(data) : null
}

export async function reviewThesis(ownerId: string, thesisId: string, decision: ThesisReviewDecision, rationale: string): Promise<InvestmentThesis> {
  if (!validOwnerId(ownerId)) throw new Error('A persisted authenticated user is required')
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const { data, error } = await supabase.rpc('review_investment_thesis', {
    p_owner_id: ownerId,
    p_thesis_id: thesisId,
    p_decision: decision,
    p_rationale: rationale.trim(),
  })
  if (error || !data) throw new Error(`Unable to review thesis: ${error?.message ?? 'unknown error'}`)
  const row = Array.isArray(data) ? data[0] : data
  if (!row) throw new Error('Unable to review thesis: no updated thesis returned')
  return normalize(row)
}

export async function updateThesisMonitorStatus(
  ownerId: string,
  monitorId: string,
  status: ThesisMonitorStatus,
): Promise<ThesisMonitor> {
  if (!validOwnerId(ownerId)) throw new Error('A persisted authenticated user is required')
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const { data, error } = await supabase.from('thesis_monitors').update({
    status,
    updated_at: new Date().toISOString(),
    last_error: null,
  }).eq('id', monitorId).eq('owner_id', ownerId).select('*').single()
  if (error || !data) throw new Error(`Unable to update thesis monitor: ${error?.message ?? 'unknown error'}`)
  return monitor(data)
}
