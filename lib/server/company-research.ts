import { startInvestigation } from './research-investigations.ts'
import { ownershipResearchModel } from '../ai/config.ts'
import { hasCurrentResearchContract, validatePacketDecisionSupport } from '../markets/research-contract.ts'
import { retrieveWorldMemory, worldResearchPreparation } from './world-retrieval.ts'
import { COMPANY_STORY_RULES } from '../markets/company-story.ts'
import { feedbackSources, loadResearchFeedback } from './research-feedback.ts'
import { needsIndependentResearch, primaryResearchPacket, PRIMARY_RESEARCH_AUTHORITY } from '../markets/evidence-authority.ts'
import { FEEDBACK_RULES, validateFeedbackReview, type ResearchFeedback, type FeedbackReview } from '../markets/research-feedback.ts'
import { beginResearchVersion, publishResearchVersion, failResearchVersion } from './research-lifecycle.ts'
import { fetchResearchBaseline, recordResearchRefresh } from './research-refresh.ts'
import { RESEARCH_ADVICE_RULES, readResearchAdvice, validateResearchNarrative, validateResearchAdvice, type ResearchAdvice } from '../markets/research-advice.ts'
import type {
  CompanyPacket,
  CompanyPacketSource,
  CompanyMarketModel,
  CompanyTranscript,
  EquityResearchNote,
  EquityResearchRevision,
  EquityResearchRevisionChange,
  EquityResearchSection,
  EquityResearchSectionId,
} from '../markets/types.ts'
import { normalizeCompanySegmentPeriods } from '../markets/company-segments.ts'
import { selectCompanyMarketBasis } from '../markets/company-market-basis.ts'
import { reconcileFinancials } from '../markets/financial-reconciliation.ts'
import { forwardPriceToEarnings, selectForwardAnnualEstimate } from '../markets/valuation.ts'
import { fetchFmpStableJson } from './fmp.ts'
import { fetchLatestDecision } from './portfolio.ts'
import { runCodexJson } from './codex-exec.ts'
import { fetchLatestMarketLeadership, fetchStockViewerData } from './markets-repository.ts'
import { getSupabaseClient } from './supabase.ts'
import { proposeStockThesis } from './theses.ts'
import { collectCompanyResearchEvidence } from './company-research-evidence.ts'
import { fetchSecLiquidityFacts } from './sec-financials.ts'
import { isEtfInstrument } from './etf-research.ts'
import { companyMarketModelPrompt, fetchLatestCompanyMarketModel, validateCompanyMarketModel, materializeCompanyMarketModel } from './company-market-model.ts'
import { collectSecFilingDocuments } from './research-documents.ts'
import { collectCompanyResearchCoverage } from './company-research-coverage.ts'
import { completeResearchSourceLedgers, withCompanyResearchSchema } from './company-research-output.ts'
import { RESEARCH_COVERAGE_RULES, researchCoverageDiagnostics, readableCompanySourceIds, validateCoverageReview, type ResearchDocument, type ResearchCoverage, type ResearchCoverageReview } from '../markets/research-coverage.ts'

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

async function loadCompanyMarketTheses(ownerId: string, symbol: string): Promise<NonNullable<CompanyPacket['marketTheses']>> {
  const supabase = getSupabaseClient()
  if (!supabase || !validOwnerId(ownerId)) return []
  const { data: hypotheses, error: hypothesisError } = await supabase.from('market_hypotheses')
    .select('id,title').eq('owner_id', ownerId).eq('status', 'active')
  if (hypothesisError || !hypotheses?.length) return []
  const hypothesisIds = hypotheses.map((item) => item.id)
  const { data: versions, error: versionError } = await supabase.from('market_thesis_versions')
    .select('id,hypothesis_id,version,state,content').in('hypothesis_id', hypothesisIds).in('state', ['active', 'weakened'])
  if (versionError || !versions?.length) return []
  const latestByHypothesis = new Map<string, typeof versions[number]>()
  for (const version of versions) {
    const current = latestByHypothesis.get(version.hypothesis_id)
    if (!current || Number(version.version) > Number(current.version)) latestByHypothesis.set(version.hypothesis_id, version)
  }
  const latestVersions = [...latestByHypothesis.values()]
  const { data: exposures, error: exposureError } = await supabase.from('market_thesis_exposures')
    .select('market_thesis_version_id,role,mechanism,materiality,verification_status')
    .eq('symbol', symbol).in('market_thesis_version_id', latestVersions.map((item) => item.id))
  if (exposureError) return []
  const hypothesisById = new Map(hypotheses.map((item) => [item.id, item.title]))
  const versionById = new Map(latestVersions.map((item) => [item.id, item]))
  return (exposures ?? []).flatMap((exposure) => {
    const version = versionById.get(exposure.market_thesis_version_id)
    if (!version) return []
    const content = record(version.content)
    return [{
      authority: 'shadow' as const, mayAuthorizeCapital: false as const,
      hypothesisId: version.hypothesis_id,
      title: hypothesisById.get(version.hypothesis_id) ?? 'Market thesis',
      version: Number(version.version), state: version.state as 'active' | 'weakened' | 'invalidated' | 'archived',
      whyNow: String(content.whyNow ?? ''), economics: String(content.economics ?? ''),
      falsifiers: Array.isArray(content.falsifiers) ? content.falsifiers.filter((item): item is string => typeof item === 'string') : [],
      exposure: {
        hypothesisId: version.hypothesis_id,
        title: hypothesisById.get(version.hypothesis_id) ?? 'Market thesis',
        version: Number(version.version), mechanism: String(exposure.mechanism), materiality: Number(exposure.materiality),
        role: exposure.role as 'beneficiary' | 'loser' | 'substitute',
        verificationStatus: exposure.verification_status as 'verified' | 'needs_company_research' | 'unverified',
      },
    }]
  })
}

interface SecSubmissionRecent {
  accessionNumber?: string[]
  filingDate?: string[]
  reportDate?: string[]
  form?: string[]
  primaryDocument?: string[]
}

interface CompanyFilingEvidence {
  title: string
  url: string
  publishedAt: string
  form: string
  excerpt: string | null
}

type FmpRequest = <T>(
  endpoint: string,
  parameters?: Record<string, string | number>,
) => Promise<T>

function transcriptDate(value: unknown): string | null {
  if (typeof value !== 'string') return null
  return value.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? null
}

function transcriptContent(value: unknown): string {
  const content = String(value ?? '').replace(/\u0000/g, '').trim()
  if (content.length <= 45_000) return content
  return `${content.slice(0, 25_000)}\n\n[Transcript middle omitted for packet size]\n\n${content.slice(-20_000)}`
}

function quarterEndDate(year: number, quarter: number): string {
  return `${year}-${['03-31', '06-30', '09-30', '12-31'][quarter - 1]}`
}

async function fetchRecentEarningsTranscripts(
  request: FmpRequest,
): Promise<CompanyTranscript[]> {
  const datesPayload = await request<unknown>('earning-call-transcript-dates')
  const dates = records(datesPayload).flatMap((item) => {
    const year = number(item.year ?? item.fiscalYear)
    const quarter = number(item.quarter)
    const date = transcriptDate(item.date ?? item.transcriptDate)
    return year !== null
      && Number.isInteger(year)
      && quarter !== null
      && Number.isInteger(quarter)
      && quarter >= 1
      && quarter <= 4
      ? [{ year, quarter, date }]
      : []
  }).sort((left, right) =>
    (right.date ?? `${right.year}-${right.quarter}`).localeCompare(left.date ?? `${left.year}-${left.quarter}`))
    .slice(0, 2)

  const settled = await Promise.allSettled(dates.map(async ({ year, quarter, date }) => {
    const payload = await request<unknown>('earning-call-transcript', { year, quarter })
    const row = records(payload)[0] ?? record(payload)
    const content = transcriptContent(row.content ?? row.transcript)
    if (!content) throw new Error(`Transcript ${year} Q${quarter} was empty`)
    return {
      year,
      quarter,
      date: transcriptDate(row.date ?? row.transcriptDate) ?? date ?? quarterEndDate(year, quarter),
      content,
      sourceId: `fmp-transcript-${year}-q${quarter}`,
    } satisfies CompanyTranscript
  }))
  return settled.flatMap((result) => result.status === 'fulfilled' ? [result.value] : [])
}

const SEC_FILING_FORMS = new Set(['10-K', '10-Q', '8-K', 'S-1', 'S-1/A', '424B4'])
const SEC_EXCERPT_TARGETS = [
  'related party',
  'affiliates',
  'acquisition',
  'artificial intelligence',
  'data center',
  'supercomputer',
  'social media',
  'products and services',
  'customers',
  'competition',
  'market opportunity',
  'government contracts',
  'regulation',
  'supply chain',
  'risk factors',
  'business',
]

export function compactSecFilingText(value: string, maximumLength = 45_000): string | null {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length < 200) return null
  if (normalized.length <= maximumLength) return normalized
  const frontLength = Math.min(30_000, Math.floor(maximumLength * (2 / 3)))
  const windows: Array<{ start: number; end: number }> = [{ start: 0, end: frontLength }]
  const lower = normalized.toLowerCase()
  for (const target of SEC_EXCERPT_TARGETS) {
    const index = lower.indexOf(target)
    if (index < 0) continue
    const start = Math.max(0, index - 1_500)
    const end = Math.min(normalized.length, index + 4_500)
    if (windows.some((window) => start <= window.end && end >= window.start)) continue
    windows.push({ start, end })
    if (windows.reduce((total, window) => total + window.end - window.start, 0) >= maximumLength) break
  }
  return windows
    .sort((left, right) => left.start - right.start)
    .map((window) => normalized.slice(window.start, window.end))
    .join('\n\n[Targeted filing excerpt]\n\n')
    .slice(0, maximumLength)
}

async function fetchRecentSecFilings(
  cikValue: unknown,
  documents: ResearchDocument[],
): Promise<CompanyFilingEvidence[]> {
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
  const filings: CompanyFilingEvidence[] = []
  for (let index = 0; index < (recent.form?.length ?? 0); index += 1) {
    const form = recent.form?.[index]
    const accession = recent.accessionNumber?.[index]
    const document = recent.primaryDocument?.[index]
    const filedAt = recent.filingDate?.[index]
    if (!form || !accession || !document || !filedAt || !SEC_FILING_FORMS.has(form)) continue
    filings.push({
      title: `${form} filed ${filedAt}${recent.reportDate?.[index] ? ` · period ${recent.reportDate[index]}` : ''}`,
      url: `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accession.replaceAll('-', '')}/${document}`,
      publishedAt: new Date(`${filedAt}T16:00:00Z`).toISOString(),
      form,
      excerpt: null,
    })
    if (filings.length >= 20) break
  }
  const captured = await collectSecFilingDocuments(filings)
  documents.push(...captured.documents)
  return captured.filings.map(f => ({...f, excerpt:f.excerpt ? compactSecFilingText(f.excerpt) : null}))
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
  worldOrigin?: Record<string, unknown> | null,
): Promise<CompanyPacket> {
  const symbol = symbolInput.trim().toUpperCase()
  const apiKey = process.env.FMP_API_KEY?.trim()
  const supabase = getSupabaseClient()
  if (!apiKey) throw new Error('FMP_API_KEY is not configured')
  if (!supabase) throw new Error('Supabase service credentials are not configured')

  const [leadership, stockViewer] = await Promise.all([
    fetchLatestMarketLeadership(),
    fetchStockViewerData(symbol),
  ])
  const leadershipStock = leadership?.stocks.find((item) => item.symbol === symbol)
  if (!leadershipStock && !stockViewer) throw new Error(`${symbol} is not in the current materialized market universe`)
  const stock = selectCompanyMarketBasis(leadershipStock ?? null, stockViewer, now)
  const group = leadershipStock
    ? leadership?.subIndustries.find((item) =>
        item.label === leadershipStock.subIndustry && item.sector === leadershipStock.sector)
    : null
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
  const sector = stock.sector === 'Classification pending'
    ? String(profile.sector ?? 'Classification pending')
    : stock.sector
  const subIndustry = stock.subIndustry === 'Classification pending'
    ? String(profile.industry ?? 'Classification pending')
    : stock.subIndustry
  const ratiosRaw = records(ratiosResult)[0] ?? record(ratiosResult)
  const researchDocuments: ResearchDocument[] = []
  const [
    incomeQuarterlyResult,
    balanceQuarterlyResult,
    cashQuarterlyResult,
    keyMetricsResult,
    gradesResult,
    productSegmentsResult,
    geographicSegmentsResult,
    secFilings,
    transcripts,
    secLiquidityResult,
  ] = await Promise.all([
    request<unknown>('income-statement', { period: 'quarter', limit: 8 }).catch(() => []),
    request<unknown>('balance-sheet-statement', { period: 'quarter', limit: 8 }).catch(() => []),
    request<unknown>('cash-flow-statement', { period: 'quarter', limit: 8 }).catch(() => []),
    request<unknown>('key-metrics-ttm').catch(() => []),
    request<unknown>('grades-consensus').catch(() => []),
    request<unknown>('revenue-product-segmentation', { period: 'annual', limit: 6 }).catch(() => []),
    request<unknown>('revenue-geographic-segmentation', { period: 'annual', limit: 6 }).catch(() => []),
    fetchRecentSecFilings(profile.cik, researchDocuments).catch(() => []),
    fetchRecentEarningsTranscripts(request).catch(() => []),
    fetchSecLiquidityFacts(profile.cik).catch(() => []),
  ])
  const incomeAnnual = records(incomeResult).map(serializableRecord)
  const balanceAnnual = records(balanceResult).map(serializableRecord)
  const cashFlowAnnual = records(cashResult).map(serializableRecord)
  const incomeQuarterly = records(incomeQuarterlyResult).map(serializableRecord)
  const balanceQuarterly = records(balanceQuarterlyResult).map(serializableRecord)
  const cashFlowQuarterly = records(cashQuarterlyResult).map(serializableRecord)
  const financialReconciliation = reconcileFinancials(balanceQuarterly, cashFlowQuarterly, secLiquidityResult)
  const keyMetrics = serializableRecord(records(keyMetricsResult)[0] ?? record(keyMetricsResult))
  const gradesConsensus = serializableRecord(records(gradesResult)[0] ?? record(gradesResult))
  const productSegments = normalizeCompanySegmentPeriods(productSegmentsResult)
  const geographicSegments = normalizeCompanySegmentPeriods(geographicSegmentsResult)
  const estimates = records(estimatesResult).map((item) =>
    Object.fromEntries(Object.entries(serializableRecord(item)).flatMap(([key, value]) =>
      typeof value === 'string' || typeof value === 'number' || value === null ? [[key, value]] : [])))
  const forwardEstimate = selectForwardAnnualEstimate(estimates, now)
  const forwardPe = forwardPriceToEarnings(stock.price, forwardEstimate)
  const researchEvidencePromise = collectCompanyResearchEvidence(
    String(profile.companyName ?? profile.name ?? symbol),
    symbol,
    typeof profile.website === 'string' ? profile.website : null,
    {
      context: {
        sector,
        subIndustry,
        description: typeof profile.description === 'string' ? profile.description : null,
        leader: typeof profile.ceo === 'string' ? profile.ceo : null,
      },
    },
  ).catch(() => [])
  const filingsAndEvents = await supabase.from('feed_items').select('title,url,published_at,metadata,section')
    .eq('scope', 'markets').contains('metadata', { topic: `company:${symbol}` })
    .order('published_at', { ascending: false }).limit(50)
  const items = (filingsAndEvents.data ?? []).map((item) => ({
    title: item.title,
    url: item.url,
    publishedAt: item.published_at,
    category: typeof item.metadata?.category === 'string' ? item.metadata.category : item.section,
  })).filter((item) => item.url && item.publishedAt).slice(0, 20)
  const [researchEvidence, marketTheses] = await Promise.all([
    researchEvidencePromise,
    loadCompanyMarketTheses(ownerId, symbol),
  ])
  const sources: CompanyPacketSource[] = [
    { id: 'alpaca-price-history', label: 'Alpaca price history', url: 'https://alpaca.markets/data', source: 'Alpaca', asOf: stock.asOf },
    ...(stock.technicalAsOf ? [{ id: 'leadership-technicals', label: 'Materialized leadership technical metrics', url: 'https://alpaca.markets/data', source: 'Alpaca', asOf: stock.technicalAsOf }] : []),
    { id: 'fmp-profile', label: 'FMP company profile', url: `https://financialmodelingprep.com/stable/profile?symbol=${symbol}`, source: 'FMP', asOf: now.toISOString() },
    { id: 'fmp-financials', label: 'FMP financial statements', url: `https://financialmodelingprep.com/stable/income-statement?symbol=${symbol}`, source: 'FMP', asOf: now.toISOString() },
    { id: 'fmp-ratios', label: 'FMP trailing ratios', url: `https://financialmodelingprep.com/stable/ratios-ttm?symbol=${symbol}`, source: 'FMP', asOf: now.toISOString() },
    { id: 'fmp-estimates', label: 'FMP analyst estimates', url: `https://financialmodelingprep.com/stable/analyst-estimates?symbol=${symbol}`, source: 'FMP', asOf: now.toISOString() },
    ...(financialReconciliation ? [{
      id: 'financial-reconciliation',
      label: 'Reconciled liquidity and debt bridge',
      url: secFilings.find((filing) => filing.title.startsWith('10-Q') || filing.title.startsWith('10-K'))?.url
        ?? 'https://data.sec.gov',
      source: financialReconciliation.liquiditySource === 'sec_edgar' ? 'SEC EDGAR + FMP' : 'FMP',
      asOf: financialReconciliation.asOf,
    }] : []),
    ...transcripts.map((transcript) => ({
      id: transcript.sourceId,
      label: `${symbol} ${transcript.year} Q${transcript.quarter} earnings-call transcript`,
      url: `https://financialmodelingprep.com/stable/earning-call-transcript?symbol=${symbol}&year=${transcript.year}&quarter=${transcript.quarter}`,
      source: 'FMP earnings transcript',
      asOf: transcript.date,
    })),
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
    ...items.map((item, index) => ({
      id: `event-${index + 1}`,
      label: item.title,
      url: item.url,
      source: item.category,
      asOf: item.publishedAt,
    })),
    ...researchEvidence.map((evidence) => ({
      id: evidence.id,
      label: evidence.title,
      url: evidence.url,
      source: `${evidence.quality} research · ${evidence.source}`,
      asOf: evidence.publishedAt,
    })),
  ]
  const peersPayload = records(peersResult)
  const peerRecord = peersPayload[0] ?? record(peersResult)
  const peers = (Array.isArray(peerRecord.peersList) ? peerRecord.peersList : peersPayload.map((item) => item.symbol))
    .filter((item): item is string => typeof item === 'string')
    .slice(0, 20)
  for (const document of researchDocuments) {
    if (!sources.some(source => source.id === document.sourceId)) sources.push({id:document.sourceId,label:'Earnings update attachment',url:document.url,source:'SEC EDGAR',asOf:document.publishedAt ?? document.capturedAt})
  }
  const version = await nextVersion('company_packets', ownerId, symbol)
  const generatedAt = now.toISOString()
  const outcomeFeedback = await loadResearchFeedback(ownerId, symbol, generatedAt)
  sources.push(...feedbackSources(outcomeFeedback))
  const packet: CompanyPacket = {
    researchDocuments,
    outcomeFeedback,
    worldOrigin: worldOrigin ? { ...worldOrigin, authority: 'shadow', mayAuthorizeCapital: false } : null,
    evidenceQuality: {
      checkedAt: generatedAt, priceAsOf: stock.asOf,
      sourceDates: sources.map(source => ({ id: source.id, asOf: source.asOf })),
      missing: [incomeAnnual.length ? null : 'annual income', balanceAnnual.length ? null : 'balance sheet', cashFlowAnnual.length ? null : 'cash flow', secFilings.length ? null : 'SEC filings', transcripts.length ? null : 'earnings transcripts', estimates.length ? null : 'consensus estimates'].filter((s): s is string => s !== null),
    },
    id: '',
    symbol,
    version,
    dataAsOf: [
      stock.asOf,
      ...items.map((item) => item.publishedAt),
      ...secFilings.map((item) => item.publishedAt),
      ...transcripts.map((item) => item.date),
      ...researchEvidence.map((item) => item.publishedAt),
      financialReconciliation?.asOf,
    ].filter((value): value is string => Boolean(value)).sort().at(-1) ?? stock.asOf,
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
      balanceQuarterly,
      cashFlowAnnual,
      cashFlowQuarterly,
    },
    financialReconciliation,
    ratios: {
      peRatio: number(ratiosRaw.priceToEarningsRatioTTM ?? ratiosRaw.peRatioTTM),
      priceToSales: number(ratiosRaw.priceToSalesRatioTTM),
      enterpriseValueToEbitda: number(ratiosRaw.enterpriseValueMultipleTTM),
      freeCashFlowYield: number(ratiosRaw.freeCashFlowYieldTTM),
      priceToFreeCashFlow: number(ratiosRaw.priceToFreeCashFlowsRatioTTM),
      returnOnEquity: number(ratiosRaw.returnOnEquityTTM),
      netMargin: number(ratiosRaw.netProfitMarginTTM),
      debtToEquity: number(ratiosRaw.debtToEquityRatioTTM),
      forwardPe,
    },
    forwardEstimate: forwardEstimate
      ? { ...forwardEstimate, forwardPe }
      : null,
    sentiment: { gradesConsensus, keyMetrics },
    segmentRevenue: {
      product: productSegments,
      geographic: geographicSegments,
    },
    estimates,
    transcripts,
    peers,
    filings: [
      ...secFilings,
      ...items.filter((item) => item.category.toLowerCase().includes('sec')),
    ].slice(0, 20),
    events: items,
    researchEvidence,
    marketTheses,
    industryContext: {
      sector,
      subIndustry,
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
  coverageReview?: ResearchCoverageReview | null
  feedbackReview?: FeedbackReview | null
  advice?: ResearchAdvice | null
  formalRating: EquityResearchNote['formalRating']
  entryAction: EquityResearchNote['entryAction']
  investmentThesis: string
  keyDebate: string
  mispricing: string
  fastestKillSignal: string
  fairValue: number | null
  entryZoneLow: number | null
  entryZoneHigh: number | null
  confidence: number
  revision: EquityResearchRevision
  sections: EquityResearchSection[]
  sourceIds: string[]
}

export function validateEquityResearch(value: unknown, allowedSourceIds?: readonly string[], feedback?: ResearchFeedback, coverage?: ResearchCoverage): ResearchGeneration {
  const output = record(value)
  const sections = Array.isArray(output.sections) ? output.sections.map(record) : []
  const ids = sections.map((section) => section.id)
  if (allowedSourceIds) {
    const allowed = new Set(allowedSourceIds)
    const cited = Array.isArray(output.sourceIds) ? output.sourceIds : []
    if (!cited.length || cited.some(id => typeof id !== 'string' || !allowed.has(id))) throw new Error('Research cites missing or unknown packet sources')
    for (const section of sections) {
      if (!Array.isArray(section.sourceIds) || section.sourceIds.some(id => !allowed.has(String(id)) || !cited.includes(id))) throw new Error('Section citation is absent from packet or report source ledger')
    }
  }
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
  const investmentThesis = string('investmentThesis')
  if (investmentThesis.includes('?')) {
    throw new Error('Investment thesis must be an affirmative statement, not a question')
  }
  if (/^(?:BUY|HOLD|SELL|NOT_RATED)\b/.test(investmentThesis.trim())) {
    throw new Error('Investment thesis must state the belief rather than repeat the rating')
  }
  const revisionRecord = record(output.revision)
  const opinionChange = revisionRecord.opinionChange as EquityResearchRevision['opinionChange']
  if (!['initial', 'more_constructive', 'less_constructive', 'unchanged'].includes(opinionChange)) {
    throw new Error('Invalid research opinion change')
  }
  const priorVersion = revisionRecord.priorVersion === null
    ? null
    : number(revisionRecord.priorVersion)
  if (priorVersion !== null && (!Number.isInteger(priorVersion) || priorVersion < 1)) {
    throw new Error('Invalid prior research version')
  }
  if (typeof revisionRecord.summary !== 'string' || !revisionRecord.summary.trim()) {
    throw new Error('Missing research revision summary')
  }
  const allowedChangeFields = new Set<EquityResearchRevisionChange['field']>([
    'formal_rating',
    'entry_action',
    'fair_value',
    'investment_thesis',
    'key_debate',
    'kill_criteria',
    'evidence',
  ])
  const revisionChanges = Array.isArray(revisionRecord.changes)
    ? revisionRecord.changes.map(record)
    : []
  if (revisionChanges.length > 8) {
    throw new Error('Research revision may contain at most eight changes')
  }
  const changes = revisionChanges.map((change) => {
    const field = change.field as EquityResearchRevisionChange['field']
    if (!allowedChangeFields.has(field)) throw new Error('Invalid research revision field')
    if (typeof change.explanation !== 'string' || !change.explanation.trim()) {
      throw new Error('Research revision change requires an explanation')
    }
    return {
      field,
      previous: String(change.previous ?? ''),
      current: String(change.current ?? ''),
      explanation: change.explanation,
    }
  })
  const advice = output.advice || allowedSourceIds ? validateResearchAdvice(output.advice, Array.isArray(output.sourceIds) ? output.sourceIds.map(String) : []) : null
  validateResearchNarrative(advice, sections.filter(s => s.id === 'verdict').map(s => String(s.content ?? '')).join('\n'))
  const coverageReview = coverage ? validateCoverageReview(output.coverageReview, coverage, sections as unknown as EquityResearchSection[], Array.isArray(output.sourceIds) ? output.sourceIds.map(String) : [], advice) : null
  return {
    coverageReview,
    feedbackReview: feedback ? validateFeedbackReview(output.feedbackReview, feedback) : null,
    advice,
    formalRating,
    entryAction,
    investmentThesis,
    keyDebate: string('keyDebate'),
    mispricing: string('mispricing'),
    fastestKillSignal: string('fastestKillSignal'),
    fairValue: number(output.fairValue),
    entryZoneLow: number(output.entryZoneLow),
    entryZoneHigh: number(output.entryZoneHigh),
    confidence,
    revision: {
      priorVersion,
      opinionChange,
      summary: revisionRecord.summary,
      changes,
    },
    sections: sections.map((section) => ({
      id: section.id as EquityResearchSectionId,
      title: String(section.title),
      content: String(section.content),
      sourceIds: Array.isArray(section.sourceIds) ? section.sourceIds.filter((item): item is string => typeof item === 'string') : [],
    })),
    sourceIds: Array.isArray(output.sourceIds) ? output.sourceIds.filter((item): item is string => typeof item === 'string') : [],
  }
}

export function researchPrompt(
  packet: CompanyPacket,
  marketModel: CompanyMarketModel | null,
  priorResearch: EquityResearchNote | null,
  reason: string,
  includePacket = true,
): string {
  const revisionInstructions = priorResearch
    ? [
        `This is a refresh of research version ${priorResearch.version}, triggered by "${reason}". Treat the prior report as the analytical baseline.`,
        'Preserve conclusions and section analysis that remain supported. Revise only where the new CompanyPacket adds, removes, or contradicts material evidence.',
        'Compare the new formal rating, entry action, fair value, thesis, key debate, and kill criteria against the prior report. Do not manufacture a change when the evidence is unchanged.',
        `Set revision.priorVersion to ${priorResearch.version}. Set revision.opinionChange to more_constructive, less_constructive, or unchanged. Summarize the net opinion change in plain English and list only supported changes, up to eight. If nothing material changed, use an empty changes array and explain the unchanged conclusion in the summary.`,
      ]
    : [
        'This is the initial report. Set revision.priorVersion to null, revision.opinionChange to initial, and include one evidence change explaining the initial evidence baseline.',
      ]
  return [
    'Act as a senior company and market research analyst. Create an institutional-quality equity research note for a 12-month decision and 1-2 year ownership lens. The supplied CompanyMarketModel is the required causal foundation for the report: begin with what the company actually sells, who needs it, the market/value-chain bottleneck it serves, and the change that can expand or erode its opportunity. Financial statements are one important proof and risk input, not the report’s organizing principle.',
    'Use only facts and source IDs present in the CompanyPacket. Never invent a current price, estimate, event, source, or citation.',
    'CompanyPacket.evidenceQuality lists missing components; retrieval time is not publication time. Explain how gaps restrict action readiness. A formal opinion alone never authorizes a portfolio recommendation.',
    'worldOrigin contains only shadow question nominations and document leads. Independently answer relevant questions from packet sources. Questions are not assertions, evidence, or authority for capital decisions. Do not cite a lead unless independently collected into packet.sources.',
    'Use the CompanyMarketModel as an analytical scaffold, not as a new source. Its factual claims remain supported only by the underlying CompanyPacket source IDs attached to them. Preserve its evidence-status distinctions and explicitly identify unsupported inference or unresolved evidence gaps.',
    'The report must explain the model’s causal chain from external change through the binding constraint or enabling capability, customer behavior, company volume/pricing/mix, monetization, and shareholder outcome. If a link is weak or unverified, make that weakness decision-relevant rather than silently closing the gap.',
    'CompanyPacket.researchEvidence is a bounded company-and-industry research pack. It is useful for framing product, AI, market, competition, and moat—but a discovery item is only a lead, independent reporting needs attribution, and primary or regulatory evidence is preferred for company claims and numbers. Do not elevate an article excerpt into an unsupported fact.',
    ...revisionInstructions,
    COMPANY_STORY_RULES,
    'An evidence-limited financial rating does not replace a company opinion. State your best supported business view, the most likely operating outcome, the specific competitive advantage or deficit, and what would reverse that judgment. Distinguish unknown facts from bounded analyst inference; do not default to undetermined when the packet supports a qualitative conclusion. Snapshot and investmentThesis must lead with the product, customer and competitive outcome; funding and valuation follow. Growth Drivers must describe concrete technical, clinical, regulatory, manufacturing and distribution obstacles and the next milestone for each material product, with management targets separated from analyst horizons.',
    'Take a position, defend it with structured evidence, and state exactly what would prove it wrong. Commit or omit; do not use empty hedging language.',
    'Keep formal BUY/HOLD/SELL separate from the practical entry action.',
    'The investmentThesis field must be a concise affirmative, falsifiable ownership belief—not a question. In one or two sentences, state what the company can become or sustain, why the market is wrong now, and the 1-2 year mechanism that can close the gap. Do not merely restate the rating, fair value, or key debate.',
    'Keep the Key Debate as the question the research must answer; it supports the thesis but is never the thesis itself.',
    'The other executive fields must state quantified Mispricing, Fastest Kill Signal, and today’s practical Entry Decision.',
    'Return confidence as a whole-number percentage from 0 to 100, not as a decimal fraction.',
    'Return exactly the 15 schema sections in schema order: Snapshot; Business Model & Moat; Financial Profile; Market & Competition; Growth Drivers; Management & Capital Allocation; Valuation; Catalysts; Bull Case; Base Case; Bear Case; Risk Factors; Sentiment & Positioning; Verdict; Kill Criteria.',
    'Use the length justified by evidence. Lead each section with its conclusion; an explicit evidence gap can be brief. Do not pad prose or repeat facts to meet a quota.',
    'Write an investor memo, not an audit workpaper: favor clear analytical prose and short connective paragraphs over a stream of labeled bullets. Use bullets only for catalysts, scenario assumptions, risks, and concrete decision rules.',
    'Keep factual, consensus, and analyst thinking distinct through natural attribution: write “reported data show” or “the latest filing shows” for facts, “consensus expects” for market expectations, “our view” for analysis, and “in our base case” for assumptions. For auditability, prefix each distinct claim paragraph with **FACT:**, **CONSENSUS:**, **VIEW:** or **ESTIMATE:**. The application strips these internal markers in its default memo view and exposes them only in Evidence mode.',
    'Attach supporting CompanyPacket source IDs only through each section sourceIds array and the report sourceIds array. Never print bracketed source IDs inside prose. Never imply a claim is sourced if the supporting source is absent.',
    'Financial Profile must analyze the available 6-8 quarter history when present and call out growth, margin, cash-flow, balance-sheet, and share-count inflections. Treat this section as a compact test of the CompanyMarketModel.financialRole: funding capacity, monetization proof, dilution, operating leverage, duration, and valuation constraint. Do not repeat the same revenue, cash-flow, or multiple discussion in Snapshot, Business Model & Moat, Market & Competition, Growth Drivers, Risk Factors, and Verdict. CompanyPacket.financialReconciliation is the authoritative same-period bridge for liquidity, debt, and net cash/debt: never recompute it from raw statement fields. Call it net cash only when netCash is positive and net debt only when netCash is negative. If the bridge has a warning, state it and do not use the affected number for valuation.',
    'Keep provider-derived free cash flow distinct from company-defined free cash flow. Do not call a GAAP loss, warrant-fair-value remeasurement, or non-GAAP reconciliation an accounting inconsistency without a primary-filing contradiction. Do not call employee withholding or warrant exercises a share repurchase unless a primary filing explicitly identifies an open-market buyback.',
    'Earnings-call transcripts are management commentary, not audited fact. When transcripts are present, compare guidance, operating priorities, demand commentary, and changed language across the two most recent calls; attribute claims to management.',
    'Business Model & Moat is the report’s foundation. Cover every material CompanyMarketModel.businessLines item and distinguish proven, scaling, emerging, and optionality businesses. Name material supported operating assets and capabilities—networks, clusters, data centers, factories, fleets, facilities, installed capacity, or distribution platforms—when they matter to customer value or economics. Explain the products and services, the customer problem, how the company fits in its value chain, revenue mechanics, geographic/FX exposure, concentration, switching costs, and a none/narrow/wide moat judgment. Identify the actual moat mechanisms (for example data, workflow embedding, switching costs, scale, regulatory approvals, distribution, or IP), the evidence for each, and the specific gaps that could erode the moat.',
    'When segmentRevenue is present, Business Model & Moat must identify which product or service lines drive revenue, growth, and mix shifts. Do not confuse product revenue categories with reportable operating segments or imply segment profit data that the packet does not contain.',
    'Market & Competition must start with two compact Markdown tables, followed by brief analytical prose. Table one is “TAM & market frame” with columns: market / value-chain layer; TAM or addressable-spend estimate; methodology and date; source; and limitation. Table two is “Competitive landscape” with columns: competitor or alternative; customer overlap; positioning / capability; company advantage or gap; and investment implication. Use 3-5 direct competitors or credible alternatives when supported. Do not make a generic peer table from ticker peers that have not been established as direct competitors.',
    'Market & Competition must synthesize CompanyMarketModel.valueChain, demandDrivers, supplyConstraints, marketStructure, competitors, strategicRelationships, and crossChecks. Name the relevant market or value-chain layer, show the demand, policy, macro, supply-chain, geopolitical, customer, or technology environment that matters, explain who captures scarcity rent, present TAM as a sourced estimate or a transparent bottom-up framework (with date, methodology, and limitations), and compare 3-5 direct competitors or credible alternatives by customer, capability, economics, and competitive implication. If the packet cannot support a TAM number, state that limitation in the table but still explain market structure and the decision consequence from the supported causal model; absence of a TAM number is not absence of market analysis.',
    'Growth Drivers must rank 3-5 CompanyMarketModel demand drivers and predictions by importance and include a compact Markdown table with: Driver; mechanism; horizon; supporting source; what proves it; and what breaks it. Prioritize concrete product adoption, capacity build-out, customer behavior, market bottlenecks, policy/regulatory shifts, and competitive changes before financial-model outputs. Separate funded/contracted or already-shipping drivers from management aspiration and optionality. Cover AI explicitly when evidence supports it: state whether it changes customer value, monetization, cost, or only narrative—and what would demonstrate adoption. Do not call AI a growth driver solely because it is mentioned in coverage.',
    'Treat strategic relationships and ecosystem links as evidence to investigate, not free options. Name a relationship only if the packet supports it; label whether it is a verified fact, management claim, or analyst inference, and explain the direct economic mechanism required before it changes the thesis.',
    'Valuation must reconcile growth assumptions with the current multiple and test what the price requires. Use a reverse-DCF-style implied-expectations analysis when inputs support it; otherwise use a transparent scenario or state that no defensible fair value can be calculated. Never let absent financial detail displace the product, market, and execution analysis or force false precision.',
    'Bull, Base, and Bear must be three genuinely comparable mini-cases driven first by different CompanyMarketModel predictions, constraint resolutions, competitive outcomes, and falsifiers—not merely by different revenue-growth and multiple assumptions. Lead each with the outcome, then use the same four compact bullets—operating assumptions, proof point, fair value / implied return, and what breaks the case. Do not repeat the general business description across scenarios.',
    'Verdict must first state the company-and-market thesis in plain English, then cover ownership fit, current setup, behavior near highs and on weakness, entry action, better trigger, sizing, liquidity, and horizon. For a high-optionality or thin-data name, make clear that sizing and milestone evidence—not a fabricated valuation model—control the decision.',
    'Kill Criteria must contain 3-5 specific numeric thresholds or observable events—not vibes.',
    'When evidence is unavailable (TAM, 13F, short interest, options, geographic mix, unit economics, etc.), say “Not available in the current packet” and explain what source would be required.',
    RESEARCH_COVERAGE_RULES,
    'When coverageReview is required, every topic must be substantively discussed in the mapped report sections, including facts that strengthen the opposing case. A coverageReview row may cite only that topic’s verified sourceIds; when this list is empty, use status unresolved and an empty row sourceIds array. Its report sections may still analyze other readable packet evidence. Each advice dimension requires at least one readable packet source ID, a substantive reason, and an observable change condition, including evidenceSufficiency: cite the available evidence whose limitations you are assessing. Prior judgments are revisable and do not override new product evidence.',
    FEEDBACK_RULES,
    RESEARCH_ADVICE_RULES,
    'Formal rating is a compatibility summary. NOT_RATED is valid when the evidence is insufficient. Unsupported facts and valuation remain unavailable.',
    '',
    priorResearch ? `PRIOR RESEARCH VERSION ${priorResearch.version}:\n${JSON.stringify(priorResearch)}` : 'PRIOR RESEARCH: none',
    '',
    marketModel ? `PRIOR COMPANY MARKET MODEL VERSION ${marketModel.version}:\n${JSON.stringify(marketModel)}` : 'Build the business-model representation in the same response before writing research.',
    '',
    includePacket ? JSON.stringify(packet) : 'COMPANY PACKET: use the same frozen packet JSON supplied above for the market model.',
  ].join('\n')
}

export function companyResearchBundlePrompt(packet: CompanyPacket, priorModel: CompanyMarketModel | null, priorResearch: EquityResearchNote | null, reason: string): string {
  return `Produce research and its company market model together in one response. Build marketModel first from primary evidence, then write research with that causal representation. This model is a compatibility projection of the same generation, never new evidence.\n${companyMarketModelPrompt(packet, priorModel, reason)}\n${researchPrompt(packet, priorModel, priorResearch, reason, false)}`
}

export async function generateFullEquityResearch(
  symbol: string,
  ownerId: string,
  reason = 'manual',
  onProgress?: (progress: number, phase: string) => Promise<void>,
  context?: { marketThesisVersionId?: string; worldOpportunityLeadId?: string; forceFullResearch?: boolean; investigationKey?: string },
): Promise<EquityResearchNote> {
  if (!validOwnerId(ownerId)) throw new Error('A persisted authenticated user is required for research ownership')
  if (await isEtfInstrument(symbol)) {
    throw new Error(`${symbol} is an ETF and must use the ETF research pipeline`)
  }
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const priorResearch = await fetchLatestCompletedEquityResearch(ownerId, symbol)
  await onProgress?.(15, priorResearch ? `Refreshing version ${priorResearch.version} evidence` : 'Collecting company evidence')
  let worldOrigin: Record<string, unknown> | null = null
  if (context?.worldOpportunityLeadId) {
    const { data, error } = await supabase.from('world_opportunity_leads').select('*').eq('id', context.worldOpportunityLeadId).eq('symbol', symbol).single()
    if (error || !data) throw new Error('Originating World dossier is unavailable or mismatched')
    worldOrigin = data
  }
  const worldPreparation = await retrieveWorldMemory({query:`${symbol} business demand constraints`,symbol,limit:12},{ownerId})
    .then(worldResearchPreparation).catch(error=>({retrievalReceipt:{error:error instanceof Error?error.message:String(error)},questions:[],documentUrls:[],authority:'questions_and_documents_only' as const}))
  worldOrigin = {...worldOrigin,decisive_questions:[...(Array.isArray(worldOrigin?.decisive_questions)?worldOrigin.decisive_questions:[]),...worldPreparation.questions],documentUrls:worldPreparation.documentUrls}
  const independentBaseline = Boolean(priorResearch && priorResearch.evidenceAuthority?.version !== 1)
  const previousPacket = priorResearch ? await fetchResearchBaseline(ownerId, 'equity', priorResearch.id) : null
  const packet = await materializeCompanyPacket(symbol, ownerId, new Date(), worldOrigin)
  Object.assign(packet,{worldMemoryPreparation:worldPreparation})
  const baseline = record(previousPacket)
  if (baseline.researchCoverage) {
    packet.researchCoverage = baseline.researchCoverage as ResearchCoverage
    for (const document of packet.researchCoverage.documents) {
      if (!packet.sources.some(source => source.id === document.sourceId)) packet.sources.push({id:document.sourceId,label:document.url.split('/').at(-1) || 'Company research document',url:document.url,source:document.quality,asOf:document.publishedAt ?? document.capturedAt})
    }
    // Freeze the reused coverage on this new packet even when no report is regenerated.
    const reused = await supabase.from('company_packets').update({packet,source_ids:packet.sources.map(s=>s.id)}).eq('id',packet.id).eq('owner_id',ownerId)
    if (reused.error) throw new Error(`Unable to persist reused research coverage: ${reused.error.message}`)
  }
  let analysisPacket = primaryResearchPacket(packet)
  const needsIndependent = needsIndependentResearch(priorResearch, previousPacket)
  const refresh = await recordResearchRefresh({ownerId,instrument:'equity',packet:analysisPacket,priorPacket:needsIndependent ? null : previousPacket ? primaryResearchPacket(previousPacket as object) : null,prior:needsIndependent ? null : priorResearch,reason:needsIndependent ? 'Initial independent primary-evidence coverage; legacy World context excluded' : reason,conditionsChanged: /kill|entry|invalidation/i.test(reason),forceFullResearch:context?.forceFullResearch || !hasCurrentResearchContract(priorResearch)})
  if (record(analysisPacket).researchRefresh) Object.assign(packet,{researchRefresh:record(analysisPacket).researchRefresh})
  if (priorResearch && refresh.kind !== 'full_research') { await onProgress?.(100, `Evidence ${refresh.kind}; retained research v${priorResearch.version}`); return priorResearch }
  await startInvestigation(ownerId,symbol,context?.investigationKey)
  await onProgress?.(45, 'Company packet assembled')
  packet.researchCoverage = await collectCompanyResearchCoverage(packet,{onProgress})
  for (const document of packet.researchCoverage.documents) {
    if (!packet.sources.some(source => source.id === document.sourceId)) packet.sources.push({id:document.sourceId,label:document.url.split('/').at(-1) || 'Company research document',url:document.url,source:document.quality,asOf:document.publishedAt ?? document.capturedAt})
  }
  packet.generatedAt = new Date().toISOString()
  const persisted = await supabase.from('company_packets').update({packet,source_ids:packet.sources.map(s=>s.id),generated_at:packet.generatedAt}).eq('id',packet.id).eq('owner_id',ownerId)
  if (persisted.error) throw new Error(`Unable to freeze research coverage: ${persisted.error.message}`)
  // Stored capture remains complete. Pass bounded passages, including every verified
  // topic quote, to synthesis so long filings cannot displace product evidence.
  analysisPacket = primaryResearchPacket({...packet,sources:packet.sources.filter(s=>readableCompanySourceIds(packet).includes(s.id)),researchDocuments:undefined,researchCoverage:{...packet.researchCoverage,documents:packet.researchCoverage.documents.map(d=>({...d,text:d.text ? [d.text.slice(0,12_000),...packet.researchCoverage!.topics.flatMap(t=>t.quotes.filter(q=>q.sourceId===d.sourceId).map(q=>q.quote))].join('\n') : null}))}})
  const previousMarketModel = await fetchLatestCompanyMarketModel(ownerId, symbol)
  const priorMarketModel = previousMarketModel?.evidenceAuthority?.version === 1 ? previousMarketModel : null
  await onProgress?.(50, 'Preparing one research and business-model generation')
  const noteRecord = await beginResearchVersion({kind:'equity',ownerId,symbol,packetId:packet.id,dataAsOf:packet.dataAsOf,previousId:priorResearch?.id??null,extra:{company_market_model_id:null}})
  const version = noteRecord.version

  try {
    await onProgress?.(72, 'Synthesizing 15-section analysis')
    const bundle = await withCompanyResearchSchema(packet, schemaPath => runCodexJson({
      model: ownershipResearchModel(),
      prompt: companyResearchBundlePrompt(analysisPacket, priorMarketModel, independentBaseline ? null : priorResearch, reason),
      schemaPath,
      validate: value => { const v=record(completeResearchSourceLedgers(value)); validatePacketDecisionSupport(record(v.research).advice,packet.evidenceQuality?.missing ?? [],packet.researchCoverage?.topics); return {research:validateEquityResearch(v.research, readableCompanySourceIds(packet), packet.outcomeFeedback, packet.researchCoverage),marketModel:validateCompanyMarketModel(v.marketModel,new Set(readableCompanySourceIds(packet)))} },
      timeoutMs: 20 * 60 * 1_000,
    }))
    const marketModel = await materializeCompanyMarketModel(packet, ownerId, reason, {data: bundle.data.marketModel, metadata: bundle.metadata})
    const result = {data: bundle.data.research, metadata: bundle.metadata}
    await onProgress?.(90, 'Validating and publishing research')
    const generatedAt = new Date().toISOString()
    if (independentBaseline && priorResearch) {
      // Compare only after generation, so legacy shadow conclusions cannot anchor it.
      const fields = [['formal_rating','formalRating'],['entry_action','entryAction'],['fair_value','fairValue'],['investment_thesis','investmentThesis'],['key_debate','keyDebate']] as const
      const changes = fields.filter(([,key]) => String(priorResearch[key]) !== String(result.data[key])).map(([field,key]) => ({field,previous:String(priorResearch[key]),current:String(result.data[key]),explanation:'Independent primary-evidence reconstruction replaced the legacy World-influenced baseline.'}))
      const rank = {SELL:0,NOT_RATED:1,HOLD:2,BUY:3}
      result.data.revision = {priorVersion:priorResearch.version,opinionChange:result.data.formalRating === 'NOT_RATED' || priorResearch.formalRating === 'NOT_RATED' ? 'initial' : rank[result.data.formalRating] > rank[priorResearch.formalRating] ? 'more_constructive' : rank[result.data.formalRating] < rank[priorResearch.formalRating] ? 'less_constructive' : 'unchanged',summary:'Reconstructed from primary evidence without legacy World conclusions; differences below are a post-generation comparison, not an inferred economic outcome.',changes}
    }
    const coverageDiagnostics = researchCoverageDiagnostics(packet.researchCoverage)
    const content = { ...result.data, coverageDiagnostics, reason, evidenceAuthority: PRIMARY_RESEARCH_AUTHORITY, worldContextOrigin: analysisPacket.worldOrigin ?? null, worldMemoryPreparation: worldPreparation }
    await publishResearchVersion({kind:'equity',id:noteRecord.id,content,sources:packet.sources,metadata:result.metadata,generatedAt,extra:{company_market_model_id:marketModel.id}})
    await onProgress?.(100, `Research complete; coverage ${coverageDiagnostics.status}, ${coverageDiagnostics.attempts} passes, ${Math.round(coverageDiagnostics.durationMs/1000)} seconds`)
    const note: EquityResearchNote = {
      id: noteRecord.id,
      coverageDiagnostics,
      companyMarketModelId: marketModel.id,
      symbol,
      version,
      status: 'complete',
      evidenceAuthority: PRIMARY_RESEARCH_AUTHORITY,
      ...result.data,
      provider: result.metadata.provider,
      model: result.metadata.model,
      dataAsOf: packet.dataAsOf,
      generatedAt,
      error: null,
    }
    await proposeStockThesis(ownerId, packet, note, reason, context?.marketThesisVersionId).catch((proposalError) => {
      // A normal research refresh stays useful if thesis storage is temporarily
      // unavailable. An exposure-led investigation, however, must retain its
      // lineage before its job can be considered complete.
      if (context?.marketThesisVersionId) throw proposalError
    })
    return note
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await failResearchVersion('equity',noteRecord.id,message)
    throw error
  }
}

function normalizeResearch(row: Record<string, unknown>): EquityResearchNote {
  const content = record(row.content)
  return {
    id: String(row.id),
    companyMarketModelId: row.company_market_model_id === null || row.company_market_model_id === undefined
      ? null
      : String(row.company_market_model_id),
    symbol: String(row.symbol),
    version: Number(row.version),
    status: row.status as EquityResearchNote['status'],
    coverageDiagnostics: content.coverageDiagnostics as EquityResearchNote['coverageDiagnostics'] ?? null,
    coverageReview: content.coverageReview as ResearchCoverageReview | undefined ?? null,
    feedbackReview: content.feedbackReview as FeedbackReview | undefined ?? null,
    evidenceAuthority: content.evidenceAuthority as EquityResearchNote['evidenceAuthority'],
    advice: readResearchAdvice(content.advice),
    formalRating: row.formal_rating as EquityResearchNote['formalRating'],
    entryAction: row.entry_action as EquityResearchNote['entryAction'],
    investmentThesis: String(content.investmentThesis ?? content.mispricing ?? ''),
    keyDebate: String(content.keyDebate ?? ''),
    mispricing: String(content.mispricing ?? ''),
    fastestKillSignal: String(content.fastestKillSignal ?? ''),
    fairValue: number(content.fairValue),
    entryZoneLow: number(content.entryZoneLow),
    entryZoneHigh: number(content.entryZoneHigh),
    confidence: Number(content.confidence ?? 0),
    revision: (() => {
      const revision = record(content.revision)
      const changes = Array.isArray(revision.changes) ? revision.changes.map(record) : []
      return {
        priorVersion: revision.priorVersion === null
          ? null
          : number(revision.priorVersion) ?? (Number(row.version) > 1 ? Number(row.version) - 1 : null),
        opinionChange: ['initial', 'more_constructive', 'less_constructive', 'unchanged'].includes(String(revision.opinionChange))
          ? revision.opinionChange as EquityResearchRevision['opinionChange']
          : Number(row.version) > 1 ? 'unchanged' : 'initial',
        summary: String(revision.summary ?? (Number(row.version) > 1
          ? 'Legacy refresh did not include a structured opinion-change summary.'
          : 'Initial research baseline.')),
        changes: changes.flatMap((change) => {
          const field = String(change.field) as EquityResearchRevisionChange['field']
          return ['formal_rating', 'entry_action', 'fair_value', 'investment_thesis', 'key_debate', 'kill_criteria', 'evidence'].includes(field)
            ? [{
                field,
                previous: String(change.previous ?? ''),
                current: String(change.current ?? ''),
                explanation: String(change.explanation ?? ''),
              }]
            : []
        }),
      }
    })(),
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

export async function fetchEquityResearchHistory(ownerId:string,symbol:string) {
 const db=getSupabaseClient();if(!db)return []
 const r=await db.from('equity_research_notes').select('id,version,generated_at').eq('owner_id',ownerId).eq('symbol',symbol).eq('status','complete').order('version',{ascending:false})
 if(r.error)throw new Error(r.error.message)
 return r.data??[]
}
export async function fetchEquityResearchVersion(ownerId:string,symbol:string,reportId:string):Promise<EquityResearchNote|null> {
 const db=getSupabaseClient();if(!db)return null
 const r=await db.from('equity_research_notes').select('*').eq('id',reportId).eq('owner_id',ownerId).eq('symbol',symbol).eq('status','complete').maybeSingle()
 if(r.error)throw new Error(r.error.message)
 return r.data?normalizeResearch(r.data):null
}
export async function fetchLatestEquityResearch(ownerId: string, symbol: string): Promise<EquityResearchNote | null> {
  const supabase = getSupabaseClient()
  if (!supabase || !validOwnerId(ownerId)) return null
  const { data } = await supabase.from('equity_research_notes').select('*').eq('owner_id', ownerId).eq('symbol', symbol)
    .order('version', { ascending: false }).limit(1).maybeSingle()
  return data ? normalizeResearch(data) : null
}

async function fetchLatestCompletedEquityResearch(ownerId: string, symbol: string): Promise<EquityResearchNote | null> {
  const supabase = getSupabaseClient()
  if (!supabase || !validOwnerId(ownerId)) return null
  const { data } = await supabase.from('equity_research_notes').select('*')
    .eq('owner_id', ownerId)
    .eq('symbol', symbol)
    .eq('status', 'complete')
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data ? normalizeResearch(data) : null
}

export async function fetchEquityResearchLibrary(ownerId: string, limit = 30): Promise<EquityResearchNote[]> {
  const supabase = getSupabaseClient()
  if (!supabase || !validOwnerId(ownerId)) return []
  const { data } = await supabase.from('equity_research_notes').select('*').eq('owner_id', ownerId)
    .order('generated_at', { ascending: false }).limit(limit)
  return (data ?? []).map((row) => normalizeResearch(row))
}
