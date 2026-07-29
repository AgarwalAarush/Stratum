import type {
  CompanyPacket,
  CompanyPacketSource,
  EquityResearchNote,
  EquityResearchSection,
  EquityResearchSectionId,
} from '../markets/types.ts'
import { normalizeCompanySegmentPeriods } from '../markets/company-segments.ts'
import { fetchFmpStableJson } from './fmp.ts'
import { fetchLatestDecision } from './portfolio.ts'
import { runCodexJson } from './codex-exec.ts'
import { fetchLatestMarketLeadership } from './markets-repository.ts'
import { getSupabaseClient } from './supabase.ts'

const RESEARCH_SECTION_IDS: EquityResearchSectionId[] = [
  'snapshot',
  'business_model_and_moat',
  'financial_profile',
  'market_and_competition',
  'growth_drivers',
  'management_and_capital_allocation',
  'valuation',
  'catalysts',
  'bull_case',
  'base_case',
  'bear_case',
  'risk_factors',
  'sentiment_and_positioning',
  'verdict',
  'kill_criteria',
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

interface SecSubmissionRecent {
  accessionNumber?: string[]
  filingDate?: string[]
  reportDate?: string[]
  form?: string[]
  primaryDocument?: string[]
}

async function fetchRecentSecFilings(
  cikValue: unknown,
): Promise<Array<{ title: string; url: string; publishedAt: string }>> {
  const cik = String(cikValue ?? '').replace(/\D/g, '')
  if (!cik) return []
  const response = await fetch(`https://data.sec.gov/submissions/CIK${cik.padStart(10, '0')}.json`, {
    signal: AbortSignal.timeout(12_000),
    headers: {
      Accept: 'application/json',
      'User-Agent': process.env.SEC_API_USER_AGENT?.trim() || 'Stratum/0.3 (aarushagarwal.dev)',
    },
  })
  if (!response.ok) throw new Error(`SEC submissions request failed (${response.status})`)
  const payload = await response.json() as { filings?: { recent?: SecSubmissionRecent } }
  const recent = payload.filings?.recent
  if (!recent) return []
  const filings: Array<{ title: string; url: string; publishedAt: string }> = []
  for (let index = 0; index < (recent.form?.length ?? 0); index += 1) {
    const form = recent.form?.[index]
    const accession = recent.accessionNumber?.[index]
    const document = recent.primaryDocument?.[index]
    const filedAt = recent.filingDate?.[index]
    if (!form || !accession || !document || !filedAt || !['10-K', '10-Q', '8-K'].includes(form)) continue
    filings.push({
      title: `${form} filed ${filedAt}${recent.reportDate?.[index] ? ` · period ${recent.reportDate[index]}` : ''}`,
      url: `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accession.replaceAll('-', '')}/${document}`,
      publishedAt: new Date(`${filedAt}T16:00:00Z`).toISOString(),
    })
    if (filings.length >= 12) break
  }
  return filings
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
    request<unknown>('income-statement', { period: 'annual', limit: 6 }),
    request<unknown>('balance-sheet-statement', { period: 'annual', limit: 6 }),
    request<unknown>('cash-flow-statement', { period: 'annual', limit: 6 }),
    request<unknown>('ratios-ttm'),
    request<unknown>('analyst-estimates', { period: 'annual', limit: 5 }),
    request<unknown>('stock-peers'),
    fetchLatestDecision(ownerId, symbol),
  ])
  const profile = serializableRecord(records(profileResult)[0] ?? record(profileResult))
  const ratiosRaw = records(ratiosResult)[0] ?? record(ratiosResult)
  const [
    incomeQuarterlyResult,
    cashQuarterlyResult,
    keyMetricsResult,
    gradesResult,
    productSegmentsResult,
    geographicSegmentsResult,
    secFilings,
  ] = await Promise.all([
    request<unknown>('income-statement', { period: 'quarter', limit: 8 }).catch(() => []),
    request<unknown>('cash-flow-statement', { period: 'quarter', limit: 8 }).catch(() => []),
    request<unknown>('key-metrics-ttm').catch(() => []),
    request<unknown>('grades-consensus').catch(() => []),
    request<unknown>('revenue-product-segmentation', { period: 'annual', limit: 6 }).catch(() => []),
    request<unknown>('revenue-geographic-segmentation', { period: 'annual', limit: 6 }).catch(() => []),
    fetchRecentSecFilings(profile.cik).catch(() => []),
  ])
  const incomeAnnual = records(incomeResult).map(serializableRecord)
  const balanceAnnual = records(balanceResult).map(serializableRecord)
  const cashFlowAnnual = records(cashResult).map(serializableRecord)
  const incomeQuarterly = records(incomeQuarterlyResult).map(serializableRecord)
  const cashFlowQuarterly = records(cashQuarterlyResult).map(serializableRecord)
  const keyMetrics = serializableRecord(records(keyMetricsResult)[0] ?? record(keyMetricsResult))
  const gradesConsensus = serializableRecord(records(gradesResult)[0] ?? record(gradesResult))
  const productSegments = normalizeCompanySegmentPeriods(productSegmentsResult)
  const geographicSegments = normalizeCompanySegmentPeriods(geographicSegmentsResult)
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
    ...(productSegments.length > 0 ? [{
      id: 'fmp-product-segments',
      label: 'FMP revenue by product',
      url: `https://financialmodelingprep.com/stable/revenue-product-segmentation?symbol=${symbol}`,
      source: 'FMP',
      asOf: productSegments[0]?.date || now.toISOString(),
    }] : []),
    ...(geographicSegments.length > 0 ? [{
      id: 'fmp-geographic-segments',
      label: 'FMP revenue by geography',
      url: `https://financialmodelingprep.com/stable/revenue-geographic-segmentation?symbol=${symbol}`,
      source: 'FMP',
      asOf: geographicSegments[0]?.date || now.toISOString(),
    }] : []),
    ...secFilings.map((filing, index) => ({
      id: `sec-filing-${index + 1}`,
      label: filing.title,
      url: filing.url,
      source: 'SEC EDGAR',
      asOf: filing.publishedAt,
    })),
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
    dataAsOf: [stock.asOf, ...items.map((item) => item.publishedAt), ...secFilings.map((item) => item.publishedAt)].sort().at(-1) ?? stock.asOf,
    generatedAt,
    priceHistory: {
      latestPrice: stock.price,
      return30d: stock.return30d,
      return1y: stock.return1y,
      vs50DayAverage: stock.vs50DayAverage,
      vs200DayAverage: stock.vs200DayAverage,
    },
    company: profile,
    fundamentals: [...incomeAnnual, ...balanceAnnual, ...cashFlowAnnual],
    financialStatements: {
      incomeAnnual,
      incomeQuarterly,
      balanceAnnual,
      cashFlowAnnual,
      cashFlowQuarterly,
    },
    ratios: {
      peRatio: number(ratiosRaw.priceToEarningsRatioTTM ?? ratiosRaw.peRatioTTM),
      priceToSales: number(ratiosRaw.priceToSalesRatioTTM),
      enterpriseValueToEbitda: number(ratiosRaw.enterpriseValueMultipleTTM),
      freeCashFlowYield: number(ratiosRaw.freeCashFlowYieldTTM),
      priceToFreeCashFlow: number(ratiosRaw.priceToFreeCashFlowsRatioTTM),
      returnOnEquity: number(ratiosRaw.returnOnEquityTTM),
      netMargin: number(ratiosRaw.netProfitMarginTTM),
      debtToEquity: number(ratiosRaw.debtToEquityRatioTTM),
    },
    sentiment: { gradesConsensus, keyMetrics },
    segmentRevenue: {
      product: productSegments,
      geographic: geographicSegments,
    },
    estimates: records(estimatesResult).map((item) =>
      Object.fromEntries(Object.entries(serializableRecord(item)).flatMap(([key, value]) =>
        typeof value === 'string' || typeof value === 'number' || value === null ? [[key, value]] : []))),
    peers,
    filings: [
      ...secFilings,
      ...items.filter((item) => item.category.toLowerCase().includes('sec')),
    ].slice(0, 20),
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
  const rawConfidence = Number(output.confidence)
  const confidence = rawConfidence > 0 && rawConfidence <= 1 ? rawConfidence * 100 : rawConfidence
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 100) throw new Error('Invalid confidence')
  const wordCount = sections.reduce((total, section) =>
    total + String(section.content ?? '').trim().split(/\s+/).filter(Boolean).length, 0)
  if (wordCount < 1_600 || wordCount > 3_000) {
    throw new Error(`Equity research must contain 1,600-3,000 words of analysis; received ${wordCount}`)
  }
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
    'Act as a senior equity research analyst. Create an institutional-quality GARP equity research note for a 12-month fair-value decision and 1-2 year ownership lens.',
    'Use only facts and source IDs present in the CompanyPacket. Never invent a current price, estimate, event, source, or citation.',
    'Take a position, defend it with structured evidence, and state exactly what would prove it wrong. Commit or omit; do not use empty hedging language.',
    'Keep formal BUY/HOLD/SELL separate from the practical entry action.',
    'The executive fields must state the Key Debate, quantified Mispricing, Fastest Kill Signal, and today’s practical Entry Decision.',
    'Return confidence as a whole-number percentage from 0 to 100, not as a decimal fraction.',
    'Return exactly the 15 schema sections in schema order: Snapshot; Business Model & Moat; Financial Profile; Market & Competition; Growth Drivers; Management & Capital Allocation; Valuation; Catalysts; Bull Case; Base Case; Bear Case; Risk Factors; Sentiment & Positioning; Verdict; Kill Criteria.',
    'Write 1,800-2,500 total words across those sections. Lead every section with its conclusion and bold the single most important number or claim.',
    'Write an investor memo, not an audit workpaper: favor clear analytical prose and short connective paragraphs over a stream of labeled bullets. Use bullets only for catalysts, scenario assumptions, risks, and concrete decision rules.',
    'Keep factual, consensus, and analyst thinking distinct through natural attribution: write “reported data show” or “the latest filing shows” for facts, “consensus expects” for market expectations, “our view” for analysis, and “in our base case” for assumptions. For auditability, prefix each distinct claim paragraph with **FACT:**, **CONSENSUS:**, **VIEW:** or **ESTIMATE:**. The application strips these internal markers in its default memo view and exposes them only in Evidence mode.',
    'Cite supporting CompanyPacket source IDs in each section. Never imply a claim is sourced if the supporting source is absent.',
    'Financial Profile must analyze the available 6-8 quarter history and call out growth, margin, cash-flow, balance-sheet, and share-count inflections.',
    'Business Model & Moat must cover revenue mechanics, customer value, geographic/FX exposure, concentration, switching costs, and a none/narrow/wide moat judgment.',
    'When segmentRevenue is present, Business Model & Moat must identify which product or service lines drive revenue, growth, and mix shifts. Do not confuse product revenue categories with reportable operating segments or imply segment profit data that the packet does not contain.',
    'Valuation must reconcile growth assumptions with the current multiple and perform a reverse-DCF-style implied-expectations analysis. If inputs are inadequate, explicitly say which calculation cannot be completed.',
    'Bull, Base, and Bear must be three genuinely comparable mini-cases: lead each with the outcome, then use the same four compact bullets—operating assumptions, proof point, fair value / implied return, and what breaks the case. Do not repeat the general business description across scenarios.',
    'Verdict must cover ownership fit, current setup, behavior near highs and on weakness, entry action, better trigger, sizing, liquidity, and horizon.',
    'Kill Criteria must contain 3-5 specific numeric thresholds or observable events—not vibes.',
    'When evidence is unavailable (TAM, 13F, short interest, options, geographic mix, unit economics, etc.), say “Not available in the current packet” and explain what source would be required.',
    'If evidence is inadequate, say so explicitly and use NOT_RATED or wait rather than filling gaps.',
    '',
    JSON.stringify(packet),
  ].join('\n')
}

export async function generateFullEquityResearch(
  symbol: string,
  ownerId: string,
  reason = 'manual',
  onProgress?: (progress: number, phase: string) => Promise<void>,
): Promise<EquityResearchNote> {
  if (!validOwnerId(ownerId)) throw new Error('A persisted authenticated user is required for research ownership')
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  await onProgress?.(15, 'Collecting company evidence')
  const packet = await materializeCompanyPacket(symbol, ownerId)
  await onProgress?.(45, 'Company packet assembled')
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
    await onProgress?.(55, 'Synthesizing 15-section analysis')
    const result = await runCodexJson({
      prompt: researchPrompt(packet),
      schemaPath: 'schemas/equity-research.schema.json',
      validate: validateEquityResearch,
      timeoutMs: 20 * 60 * 1_000,
    })
    await onProgress?.(90, 'Validating and publishing research')
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
    await onProgress?.(100, 'Research complete')
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
