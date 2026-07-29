import type {
  CompanyPacket,
  CompanyPacketSource,
  EquityResearchNote,
  EquityResearchSection,
  EquityResearchSectionId,
} from '../markets/types.ts'
import { fetchFmpStableJson } from './fmp.ts'
import { fetchLatestDecision } from './portfolio.ts'
import { runCodexJson } from './codex-exec.ts'
import { fetchLatestMarketLeadership } from './markets-repository.ts'
import { getSupabaseClient } from './supabase.ts'

const RESEARCH_SECTION_IDS: EquityResearchSectionId[] = [
  'executive_summary',
  'variant_view',
  'business_model',
  'industry_structure',
  'competitive_position',
  'management_and_governance',
  'historical_financials',
  'earnings_quality',
  'forward_estimates',
  'valuation',
  'catalysts',
  'risks',
  'scenario_analysis',
  'thesis_monitoring',
  'sources_and_method',
]

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function records(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.map(record) : []
}

function serializableRecord(value: Record<string, unknown>): Record<string, string | number | boolean | null> {
  return Object.fromEntries(Object.entries(value).flatMap(([key, item]) =>
    typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean' || item === null
      ? [[key, item]]
      : []))
}

function number(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const result = Number(value)
  return Number.isFinite(result) ? result : null
}

function validOwnerId(ownerId: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(ownerId)
}

async function nextVersion(table: 'company_packets' | 'equity_research_notes', ownerId: string, symbol: string): Promise<number> {
  const supabase = getSupabaseClient()
  if (!supabase) return 1
  let query = supabase.from(table).select('version').eq('symbol', symbol).order('version', { ascending: false }).limit(1)
  query = validOwnerId(ownerId) ? query.eq('owner_id', ownerId) : query.is('owner_id', null)
  const { data } = await query.maybeSingle()
  return Number(data?.version ?? 0) + 1
}

export async function materializeCompanyPacket(
  symbolInput: string,
  ownerId: string,
  now = new Date(),
): Promise<CompanyPacket> {
  const symbol = symbolInput.trim().toUpperCase()
  const apiKey = process.env.FMP_API_KEY?.trim()
  const supabase = getSupabaseClient()
  if (!apiKey) throw new Error('FMP_API_KEY is not configured')
  if (!supabase) throw new Error('Supabase service credentials are not configured')

  const leadership = await fetchLatestMarketLeadership()
  const stock = leadership?.stocks.find((item) => item.symbol === symbol)
  if (!stock) throw new Error(`${symbol} is not in the current materialized market universe`)
  const group = leadership?.subIndustries.find((item) => item.label === stock.subIndustry && item.sector === stock.sector)
  const request = <T>(endpoint: string, parameters: Record<string, string | number> = {}) =>
    fetchFmpStableJson<T>(endpoint, { symbol, ...parameters }, { apiKey })
  const [profileResult, incomeResult, balanceResult, cashResult, ratiosResult, estimatesResult, peersResult, thesis] = await Promise.all([
    request<unknown>('profile'),
    request<unknown>('income-statement', { period: 'annual', limit: 5 }),
    request<unknown>('balance-sheet-statement', { period: 'annual', limit: 5 }),
    request<unknown>('cash-flow-statement', { period: 'annual', limit: 5 }),
    request<unknown>('ratios-ttm'),
    request<unknown>('analyst-estimates', { period: 'annual', limit: 5 }),
    request<unknown>('stock-peers'),
    fetchLatestDecision(ownerId, symbol),
  ])
  const profile = serializableRecord(records(profileResult)[0] ?? record(profileResult))
  const ratiosRaw = records(ratiosResult)[0] ?? record(ratiosResult)
  const filingsAndEvents = await supabase.from('feed_items').select('title,url,published_at,metadata,section')
    .eq('scope', 'markets').contains('metadata', { topic: `company:${symbol}` })
    .order('published_at', { ascending: false }).limit(50)
  const items = (filingsAndEvents.data ?? []).map((item) => ({
    title: item.title,
    url: item.url,
    publishedAt: item.published_at,
    category: typeof item.metadata?.category === 'string' ? item.metadata.category : item.section,
  })).filter((item) => item.url && item.publishedAt)
  const sources: CompanyPacketSource[] = [
    { id: 'alpaca-price-history', label: 'Alpaca price history', url: 'https://alpaca.markets/data', source: 'Alpaca', asOf: stock.asOf },
    { id: 'fmp-profile', label: 'FMP company profile', url: `https://financialmodelingprep.com/stable/profile?symbol=${symbol}`, source: 'FMP', asOf: now.toISOString() },
    { id: 'fmp-financials', label: 'FMP financial statements', url: `https://financialmodelingprep.com/stable/income-statement?symbol=${symbol}`, source: 'FMP', asOf: now.toISOString() },
    { id: 'fmp-estimates', label: 'FMP analyst estimates', url: `https://financialmodelingprep.com/stable/analyst-estimates?symbol=${symbol}`, source: 'FMP', asOf: now.toISOString() },
    ...items.slice(0, 20).map((item, index) => ({
      id: `event-${index + 1}`,
      label: item.title,
      url: item.url,
      source: item.category,
      asOf: item.publishedAt,
    })),
  ]
  const peersPayload = records(peersResult)
  const peerRecord = peersPayload[0] ?? record(peersResult)
  const peers = (Array.isArray(peerRecord.peersList) ? peerRecord.peersList : peersPayload.map((item) => item.symbol))
    .filter((item): item is string => typeof item === 'string')
    .slice(0, 20)
  const version = await nextVersion('company_packets', ownerId, symbol)
  const generatedAt = now.toISOString()
  const packet: CompanyPacket = {
    id: '',
    symbol,
    version,
    dataAsOf: [stock.asOf, ...items.map((item) => item.publishedAt)].sort().at(-1) ?? stock.asOf,
    generatedAt,
    priceHistory: {
      latestPrice: stock.price,
      return30d: stock.return30d,
      return1y: stock.return1y,
      vs50DayAverage: stock.vs50DayAverage,
      vs200DayAverage: stock.vs200DayAverage,
    },
    company: profile,
    fundamentals: [
      ...records(incomeResult).map(serializableRecord),
      ...records(balanceResult).map(serializableRecord),
      ...records(cashResult).map(serializableRecord),
    ],
    ratios: {
      peRatio: number(ratiosRaw.priceToEarningsRatioTTM ?? ratiosRaw.peRatioTTM),
      priceToSales: number(ratiosRaw.priceToSalesRatioTTM),
      returnOnEquity: number(ratiosRaw.returnOnEquityTTM),
      netMargin: number(ratiosRaw.netProfitMarginTTM),
      debtToEquity: number(ratiosRaw.debtToEquityRatioTTM),
    },
    estimates: records(estimatesResult).map((item) =>
      Object.fromEntries(Object.entries(serializableRecord(item)).flatMap(([key, value]) =>
        typeof value === 'string' || typeof value === 'number' || value === null ? [[key, value]] : []))),
    peers,
    filings: items.filter((item) => item.category.toLowerCase().includes('sec')),
    events: items,
    industryContext: {
      sector: stock.sector,
      subIndustry: stock.subIndustry,
      groupReturn30d: group?.return30d ?? null,
      groupReturn1y: group?.return1y ?? null,
    },
    existingThesis: thesis,
    sources,
  }
  const { data: inserted, error } = await supabase.from('company_packets').insert({
    symbol,
    owner_id: validOwnerId(ownerId) ? ownerId : null,
    version,
    status: 'complete',
    packet,
    source_ids: sources.map((source) => source.id),
    data_as_of: packet.dataAsOf,
    generated_at: generatedAt,
  }).select('id').single()
  if (error || !inserted) throw new Error(`Unable to persist CompanyPacket: ${error?.message ?? 'unknown error'}`)
  packet.id = inserted.id
  await supabase.from('company_packets').update({ packet }).eq('id', inserted.id)
  return packet
}

interface ResearchGeneration {
  formalRating: EquityResearchNote['formalRating']
  entryAction: EquityResearchNote['entryAction']
  keyDebate: string
  mispricing: string
  fastestKillSignal: string
  fairValue: number | null
  entryZoneLow: number | null
  entryZoneHigh: number | null
  confidence: number
  sections: EquityResearchSection[]
  sourceIds: string[]
}

export function validateEquityResearch(value: unknown): ResearchGeneration {
  const output = record(value)
  const sections = Array.isArray(output.sections) ? output.sections.map(record) : []
  const ids = sections.map((section) => section.id)
  if (sections.length !== 15 || RESEARCH_SECTION_IDS.some((id) => !ids.includes(id))) {
    throw new Error('Equity research must contain each of the 15 required sections exactly once')
  }
  const formalRating = output.formalRating as EquityResearchNote['formalRating']
  const entryAction = output.entryAction as EquityResearchNote['entryAction']
  if (!['BUY', 'HOLD', 'SELL', 'NOT_RATED'].includes(formalRating)) throw new Error('Invalid formal rating')
  if (!['buy_now', 'nibble', 'wait', 'add_on_weakness', 'avoid'].includes(entryAction)) throw new Error('Invalid entry action')
  const string = (key: string) => {
    if (typeof output[key] !== 'string' || !output[key]) throw new Error(`Missing ${key}`)
    return output[key] as string
  }
  const confidence = Number(output.confidence)
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 100) throw new Error('Invalid confidence')
  return {
    formalRating,
    entryAction,
    keyDebate: string('keyDebate'),
    mispricing: string('mispricing'),
    fastestKillSignal: string('fastestKillSignal'),
    fairValue: number(output.fairValue),
    entryZoneLow: number(output.entryZoneLow),
    entryZoneHigh: number(output.entryZoneHigh),
    confidence,
    sections: sections.map((section) => ({
      id: section.id as EquityResearchSectionId,
      title: String(section.title),
      content: String(section.content),
      sourceIds: Array.isArray(section.sourceIds) ? section.sourceIds.filter((item): item is string => typeof item === 'string') : [],
    })),
    sourceIds: Array.isArray(output.sourceIds) ? output.sourceIds.filter((item): item is string => typeof item === 'string') : [],
  }
}

function researchPrompt(packet: CompanyPacket): string {
  return [
    'Create an institutional-quality equity research note for a 1-2 year ownership decision.',
    'Use only facts and source IDs present in the CompanyPacket. Never invent a current price, estimate, event, source, or citation.',
    'Keep formal BUY/HOLD/SELL separate from the practical entry action.',
    'The executive summary must clearly state Key Debate, Mispricing, Fastest Kill Signal, and Entry Decision.',
    'Return exactly the 15 schema sections. Use concise Markdown in each section and cite supporting source IDs.',
    'If evidence is inadequate, say so explicitly and use NOT_RATED or wait rather than filling gaps.',
    '',
    JSON.stringify(packet),
  ].join('\n')
}

export async function generateFullEquityResearch(
  symbol: string,
  ownerId: string,
  reason = 'manual',
): Promise<EquityResearchNote> {
  if (!validOwnerId(ownerId)) throw new Error('A persisted authenticated user is required for research ownership')
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const packet = await materializeCompanyPacket(symbol, ownerId)
  const version = await nextVersion('equity_research_notes', ownerId, symbol)
  const { data: noteRecord, error: createError } = await supabase.from('equity_research_notes').insert({
    symbol,
    owner_id: ownerId,
    company_packet_id: packet.id,
    version,
    status: 'running',
    data_as_of: packet.dataAsOf,
  }).select('id').single()
  if (createError || !noteRecord) throw new Error(`Unable to create research version: ${createError?.message ?? 'unknown error'}`)
  try {
    const result = await runCodexJson({
      prompt: researchPrompt(packet),
      schemaPath: 'schemas/equity-research.schema.json',
      validate: validateEquityResearch,
      timeoutMs: 20 * 60 * 1_000,
    })
    const generatedAt = new Date().toISOString()
    const content = { ...result.data, reason }
    const { error } = await supabase.from('equity_research_notes').update({
      status: 'complete',
      formal_rating: result.data.formalRating,
      entry_action: result.data.entryAction,
      content,
      provider: result.metadata.provider,
      model: result.metadata.model,
      generated_at: generatedAt,
      error: null,
    }).eq('id', noteRecord.id).eq('status', 'running')
    if (error) throw new Error(`Unable to publish research version: ${error.message}`)
    if (packet.sources.length > 0) {
      const used = new Set(result.data.sourceIds)
      const { error: sourceError } = await supabase.from('equity_research_sources').insert(
        packet.sources.filter((source) => used.has(source.id)).map((source) => ({
          research_note_id: noteRecord.id,
          source_id: source.id,
          label: source.label,
          url: source.url,
          source: source.source,
          source_as_of: source.asOf,
        })),
      )
      if (sourceError) throw new Error(`Unable to persist research sources: ${sourceError.message}`)
    }
    return {
      id: noteRecord.id,
      symbol,
      version,
      status: 'complete',
      ...result.data,
      provider: result.metadata.provider,
      model: result.metadata.model,
      dataAsOf: packet.dataAsOf,
      generatedAt,
      error: null,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await supabase.from('equity_research_notes').update({ status: 'failed', error: message }).eq('id', noteRecord.id)
    throw error
  }
}

function normalizeResearch(row: Record<string, unknown>): EquityResearchNote {
  const content = record(row.content)
  return {
    id: String(row.id),
    symbol: String(row.symbol),
    version: Number(row.version),
    status: row.status as EquityResearchNote['status'],
    formalRating: row.formal_rating as EquityResearchNote['formalRating'],
    entryAction: row.entry_action as EquityResearchNote['entryAction'],
    keyDebate: String(content.keyDebate ?? ''),
    mispricing: String(content.mispricing ?? ''),
    fastestKillSignal: String(content.fastestKillSignal ?? ''),
    fairValue: number(content.fairValue),
    entryZoneLow: number(content.entryZoneLow),
    entryZoneHigh: number(content.entryZoneHigh),
    confidence: Number(content.confidence ?? 0),
    sections: Array.isArray(content.sections) ? content.sections as EquityResearchSection[] : [],
    sourceIds: Array.isArray(content.sourceIds) ? content.sourceIds.filter((item): item is string => typeof item === 'string') : [],
    provider: String(row.provider ?? ''),
    model: String(row.model ?? ''),
    dataAsOf: String(row.data_as_of),
    generatedAt: String(row.generated_at),
    error: row.error === null ? null : String(row.error ?? ''),
  }
}

export async function fetchLatestCompanyPacket(ownerId: string, symbol: string): Promise<CompanyPacket | null> {
  const supabase = getSupabaseClient()
  if (!supabase) return null
  let query = supabase.from('company_packets').select('packet').eq('symbol', symbol).eq('status', 'complete')
    .order('version', { ascending: false }).limit(1)
  query = validOwnerId(ownerId) ? query.eq('owner_id', ownerId) : query.is('owner_id', null)
  const { data } = await query.maybeSingle()
  return data && record(data.packet).symbol === symbol ? data.packet as CompanyPacket : null
}

export async function fetchLatestEquityResearch(ownerId: string, symbol: string): Promise<EquityResearchNote | null> {
  const supabase = getSupabaseClient()
  if (!supabase || !validOwnerId(ownerId)) return null
  const { data } = await supabase.from('equity_research_notes').select('*').eq('owner_id', ownerId).eq('symbol', symbol)
    .order('version', { ascending: false }).limit(1).maybeSingle()
  return data ? normalizeResearch(data) : null
}

export async function fetchEquityResearchLibrary(ownerId: string, limit = 30): Promise<EquityResearchNote[]> {
  const supabase = getSupabaseClient()
  if (!supabase || !validOwnerId(ownerId)) return []
  const { data } = await supabase.from('equity_research_notes').select('*').eq('owner_id', ownerId)
    .order('generated_at', { ascending: false }).limit(limit)
  return (data ?? []).map((row) => normalizeResearch(row))
}
