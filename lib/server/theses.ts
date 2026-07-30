import type {
  CandidateBrief,
  CompanyPacket,
  EquityResearchNote,
  InvestmentThesis,
  ThesisContent,
  ThesisEntityType,
  ThesisMonitor,
  ThesisMonitorCoverage,
  ThesisMonitorOutcome,
  ThesisMonitorStatus,
  ThesisSource,
  ThesisStatus,
  ThesisWorkspaceData,
} from '../markets/types.ts'
import {
  industryThesisContent,
  stockThesisContent,
  thesisEntityKey,
  thesisSources,
} from '../markets/theses.ts'
import { getSupabaseClient } from './supabase.ts'

function validOwnerId(ownerId: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(ownerId)
}

function thesisStorageUnavailable(message: string | undefined): boolean {
  return Boolean(message && /investment_theses|schema cache/i.test(message))
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function sources(value: unknown): ThesisSource[] {
  return Array.isArray(value) ? value.flatMap((item) => {
    const source = record(item)
    return typeof source.label === 'string' && typeof source.url === 'string' && typeof source.asOf === 'string'
      ? [{ label: source.label, url: source.url, asOf: source.asOf }]
      : []
  }) : []
}

function content(value: unknown): ThesisContent {
  const item = record(value)
  return {
    headline: String(item.headline ?? ''),
    summary: String(item.summary ?? ''),
    coreBelief: String(item.coreBelief ?? ''),
    whatChanged: String(item.whatChanged ?? ''),
    catalysts: stringArray(item.catalysts),
    invalidation: stringArray(item.invalidation),
    nextQuestion: String(item.nextQuestion ?? ''),
    confidence: Math.max(0, Math.min(100, Number(item.confidence ?? 0))),
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
    content: content(row.content),
    sources: sources(row.source_refs),
    dataAsOf: String(row.data_as_of),
    generatedAt: String(row.generated_at),
    reviewedAt: row.reviewed_at === null ? null : String(row.reviewed_at ?? ''),
    researchNoteId: row.research_note_id === null ? null : String(row.research_note_id ?? ''),
  }
}

function monitor(row: Record<string, unknown>): ThesisMonitor {
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
}

async function saveProposal(input: ProposalInput): Promise<InvestmentThesis | null> {
  if (!validOwnerId(input.ownerId)) return null
  const supabase = getSupabaseClient()
  if (!supabase) return null
  const entityKey = thesisEntityKey(input.entityType, input)
  const { data: latest, error: latestError } = await supabase.from('investment_theses')
    .select('version,status,content').eq('owner_id', input.ownerId).eq('entity_key', entityKey)
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
  return normalize(data)
}

export async function proposeStockThesis(
  ownerId: string,
  packet: CompanyPacket,
  research: EquityResearchNote,
  trigger: string,
): Promise<InvestmentThesis | null> {
  return saveProposal({
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
}

export async function proposeIndustryTheses(ownerId: string, briefs: CandidateBrief[]): Promise<number> {
  const groups = new Map<string, CandidateBrief[]>()
  for (const brief of briefs) {
    if (brief.subIndustry === 'Unknown' || brief.subIndustry === 'Classification pending') continue
    const key = `${brief.sector}\u0000${brief.subIndustry}`
    groups.set(key, [...(groups.get(key) ?? []), brief])
  }
  let created = 0
  for (const group of groups.values()) {
    const first = group[0]!
    if (group.length < 2 && first.primaryLane !== 'leadership') continue
    const proposal = await saveProposal({
      ownerId,
      entityType: 'sub_industry',
      sector: first.sector,
      subIndustry: first.subIndustry,
      trigger: 'candidate-scout',
      content: industryThesisContent(group)!,
      sources: group.flatMap((brief) => brief.evidence).slice(0, 8),
      dataAsOf: first.generatedAt,
    })
    if (proposal) created += 1
  }
  return created
}

export async function fetchThesisWorkspace(ownerId: string): Promise<ThesisWorkspaceData> {
  const supabase = getSupabaseClient()
  if (!supabase || !validOwnerId(ownerId)) return { proposals: [], accepted: [], monitors: [] }
  const [{ data, error }, monitorResult] = await Promise.all([
    supabase.from('investment_theses').select('*').eq('owner_id', ownerId)
      .order('generated_at', { ascending: false }).limit(160),
    supabase.from('thesis_monitors').select('*').eq('owner_id', ownerId)
      .order('updated_at', { ascending: false }),
  ])
  if (error) {
    if (thesisStorageUnavailable(error.message)) return { proposals: [], accepted: [], monitors: [] }
    throw new Error(`Unable to load thesis workspace: ${error.message}`)
  }
  if (monitorResult.error && !/thesis_monitors|schema cache/i.test(monitorResult.error.message)) {
    throw new Error(`Unable to load thesis monitors: ${monitorResult.error.message}`)
  }
  const rows = (data ?? []).map((row) => normalize(row))
  const proposals = rows.filter((item) => item.status === 'proposed')
  const accepted = [] as InvestmentThesis[]
  const seen = new Set<string>()
  for (const thesis of rows) {
    if (thesis.status !== 'accepted' || seen.has(thesis.entityKey)) continue
    seen.add(thesis.entityKey)
    accepted.push(thesis)
  }
  return {
    proposals,
    accepted,
    monitors: (monitorResult.data ?? []).map((row) => monitor(row)),
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

export async function reviewThesis(ownerId: string, thesisId: string, decision: 'accept' | 'reject'): Promise<InvestmentThesis> {
  if (!validOwnerId(ownerId)) throw new Error('A persisted authenticated user is required')
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const { data, error } = await supabase.rpc('review_investment_thesis', {
    p_owner_id: ownerId,
    p_thesis_id: thesisId,
    p_decision: decision,
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
