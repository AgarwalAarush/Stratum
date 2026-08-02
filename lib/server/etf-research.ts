import { parseHTML } from 'linkedom'
import type {
  EtfHolding,
  EtfResearchNote,
  EtfResearchPacket,
  EtfResearchSection,
  EtfResearchSectionId,
  EquityResearchRevision,
  EquityResearchRevisionChange,
} from '../markets/types.ts'
import { runCodexJson } from './codex-exec.ts'
import { fetchStockViewerData } from './markets-repository.ts'
import { getSupabaseClient } from './supabase.ts'

const ETF_SECTION_IDS: EtfResearchSectionId[] = [
  'fund_snapshot', 'portfolio_exposure', 'top_holdings', 'index_and_rebalance',
  'fundamentals_look_through', 'valuation_and_setup', 'catalysts', 'bull_case',
  'base_case', 'bear_case', 'risk_factors', 'verdict',
]

interface IssuerSource {
  issuer: string
  summaryUrl: string
  holdingsUrl: string
  parse: (summaryHtml: string, holdingsHtml: string, now: Date) => Omit<EtfResearchPacket, 'id' | 'symbol' | 'version' | 'generatedAt' | 'dataAsOf' | 'priceHistory' | 'sources'> & { dataAsOf: string }
}

const ETF_SOURCES: Record<string, IssuerSource> = {
  GRID: {
    issuer: 'First Trust',
    summaryUrl: 'https://www.ftportfolios.com/retail/etf/etfsummary.aspx?ticker=grid',
    holdingsUrl: 'https://www.ftportfolios.com/retail/etf/ETFholdings.aspx?Ticker=GRID',
    parse: (summaryHtml, holdingsHtml, now) => ({
      ...parseFirstTrust(summaryHtml, holdingsHtml),
      dataAsOf: extractAsOf(holdingsHtml, now),
    }),
  },
  URA: {
    issuer: 'Global X',
    summaryUrl: 'https://www.globalxetfs.com/funds/ura',
    holdingsUrl: 'https://www.globalxetfs.com/funds/ura',
    parse: (summaryHtml, holdingsHtml, now) => ({
      ...parseGlobalX(summaryHtml, holdingsHtml),
      dataAsOf: extractAsOf(holdingsHtml, now),
    }),
  },
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function number(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function validOwnerId(ownerId: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(ownerId)
}

function parseDecimal(value: string): number | null {
  const normalized = value.replace(/[$,%\s]/g, '').replaceAll(',', '')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function parsePercent(value: string): number | null {
  const parsed = parseDecimal(value)
  return parsed === null ? null : Math.round((parsed / 100) * 1e10) / 1e10
}

function pageText(html: string): string {
  const { document } = parseHTML(html)
  const root = document.querySelector('main, article, body')
  return (root?.textContent ?? document.documentElement?.textContent ?? '').replace(/\s+/g, ' ').trim()
}

function firstMatch(text: string, expression: RegExp): string | null {
  return text.match(expression)?.[1]?.trim() ?? null
}

function extractAsOf(html: string, now: Date): string {
  const text = pageText(html)
  const value = firstMatch(text, /(?:Holdings(?: of the Fund)?|Current Fund Data|Top Holdings|Key Information|Fund Holdings Data)\s*(?:\([^)]*)?(?:as of|As of)\s*([A-Z][a-z]{2}\s+\d{1,2},?\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{4})/i)
  const parsed = value ? Date.parse(value) : Number.NaN
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : now.toISOString()
}

function tableHoldings(html: string): EtfHolding[] {
  const { document } = parseHTML(html)
  const rows = [...document.querySelectorAll('tr')]
  const seen = new Set<string>()
  const holdings: EtfHolding[] = []
  for (const row of rows) {
    const cells = [...row.querySelectorAll('td')].map((cell) => cell.textContent?.replace(/\s+/g, ' ').trim() ?? '')
    if (cells.length < 3) continue
    const weightIndex = cells.findLastIndex((cell) => /^\d+(?:\.\d+)?%$/.test(cell))
    if (weightIndex < 1) continue
    const name = cells[0] ?? ''
    const weight = parsePercent(cells[weightIndex] ?? '')
    if (!name || weight === null || weight <= 0 || seen.has(name)) continue
    seen.add(name)
    const identifier = cells[1] && /^[A-Z0-9./-]{2,18}$/i.test(cells[1]) ? cells[1] : null
    const symbols = cells.filter((cell) => /^[A-Z]{1,6}(?:[./-][A-Z]{1,4})?$/.test(cell))
    const symbol = symbols.find((cell) => cell !== identifier) ?? null
    const money = cells.find((cell) => /^\$[\d,.]+$/.test(cell))
    const shares = cells.find((cell) => /^\d[\d,]*$/.test(cell))
    holdings.push({
      symbol,
      name,
      identifier,
      classification: cells.length > 3 ? cells[Math.min(2, weightIndex - 1)] || null : null,
      shares: shares ? parseDecimal(shares) : null,
      marketValue: money ? parseDecimal(money) : null,
      weight,
    })
  }
  return holdings.sort((left, right) => right.weight - left.weight)
}

function csvCells(line: string): string[] {
  const cells: string[] = []
  let cell = ''
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]!
    if (character === '"' && line[index + 1] === '"') {
      cell += '"'
      index += 1
    } else if (character === '"') {
      quoted = !quoted
    } else if (character === ',' && !quoted) {
      cells.push(cell.trim())
      cell = ''
    } else {
      cell += character
    }
  }
  cells.push(cell.trim())
  return cells
}

function globalXCsvHoldings(csv: string): EtfHolding[] {
  const lines = csv.split(/\r?\n/).filter(Boolean)
  const headerIndex = lines.findIndex((line) => line.toLowerCase().startsWith('% of net assets,ticker,name,'))
  if (headerIndex < 0) return []
  return lines.slice(headerIndex + 1).flatMap((line) => {
    const [weightText, symbol, name, identifier, , shares, marketValue] = csvCells(line)
    const weight = parsePercent(weightText ?? '')
    if (!name || weight === null || weight <= 0) return []
    return [{
      symbol: symbol || null,
      name,
      identifier: identifier || null,
      classification: null,
      shares: shares ? parseDecimal(shares) : null,
      marketValue: marketValue ? parseDecimal(marketValue) : null,
      weight,
    }]
  }).sort((left, right) => right.weight - left.weight)
}

function globalXHtmlHoldings(html: string): EtfHolding[] {
  const { document } = parseHTML(html)
  const table = [...document.querySelectorAll('table')].find((candidate) => {
    const headers = [...candidate.querySelectorAll('th')].map((cell) => cell.textContent?.replace(/\s+/g, ' ').trim().toLowerCase() ?? '')
    return headers.includes('net assets (%)') && headers.includes('ticker') && headers.includes('name')
  })
  if (!table) return []
  const rows = [...table.querySelectorAll('tr')]
  const headers = [...(rows[0]?.querySelectorAll('th') ?? [])].map((cell) => cell.textContent?.replace(/\s+/g, ' ').trim().toLowerCase() ?? '')
  const column = (name: string) => headers.indexOf(name)
  const weightColumn = column('net assets (%)')
  const tickerColumn = column('ticker')
  const nameColumn = column('name')
  const sedolColumn = column('sedol')
  const sharesColumn = column('shares held')
  const marketValueColumn = column('market value')
  if (weightColumn < 0 || nameColumn < 0) return []
  return rows.slice(1).flatMap((row) => {
    const cells = [...row.querySelectorAll('td')].map((cell) => cell.textContent?.replace(/\s+/g, ' ').trim() ?? '')
    const weight = parsePercent(cells[weightColumn] ?? '')
    const name = cells[nameColumn] ?? ''
    if (!name || weight === null || weight <= 0) return []
    return [{
      symbol: tickerColumn >= 0 && cells[tickerColumn] ? cells[tickerColumn] : null,
      name,
      identifier: sedolColumn >= 0 && cells[sedolColumn] ? cells[sedolColumn] : null,
      classification: null,
      shares: sharesColumn >= 0 ? parseDecimal(cells[sharesColumn] ?? '') : null,
      marketValue: marketValueColumn >= 0 ? parseDecimal(cells[marketValueColumn] ?? '') : null,
      weight,
    }]
  }).sort((left, right) => right.weight - left.weight)
}

function globalXHoldings(content: string): EtfHolding[] {
  return content.includes('% of Net Assets,Ticker,Name,')
    ? globalXCsvHoldings(content)
    : globalXHtmlHoldings(content)
}

function globalXHoldingsUrl(summaryHtml: string): string {
  const url = summaryHtml.match(/https:\/\/assets\.globalxetfs\.com\/funds\/holdings\/[a-z0-9_-]+_full-holdings_\d{8}\.csv/i)?.[0]
  if (!url) throw new Error('Global X did not publish a current holdings CSV URL')
  return url
}

function extractMoney(text: string, label: string): number | null {
  const value = firstMatch(text, new RegExp(`${label}\\s*[:\\-]?\\s*(\\$[\\d,.]+)`, 'i'))
  return value ? parseDecimal(value) : null
}

function extractScaledMoney(text: string, label: string): number | null {
  const match = text.match(new RegExp(`${label}\\s*[:\\-]?\\s*(\\$[\\d,.]+)(?:\\s*(thousand|million|billion))?`, 'i'))
  const value = match?.[1] ? parseDecimal(match[1]) : null
  if (value === null) return null
  const unit = match?.[2]?.toLowerCase()
  const multiplier = unit === 'billion' ? 1e9 : unit === 'million' ? 1e6 : unit === 'thousand' ? 1e3 : 1
  return value * multiplier
}

function extractPercent(text: string, label: string): number | null {
  const value = firstMatch(text, new RegExp(`${label}\\s*[?:\\-]?\\s*(\\d+(?:\\.\\d+)?)%`, 'i'))
  return value ? parsePercent(value) : null
}

function basePacket(
  values: Omit<EtfResearchPacket, 'id' | 'symbol' | 'version' | 'generatedAt' | 'dataAsOf' | 'priceHistory' | 'sources'>,
): Omit<EtfResearchPacket, 'id' | 'symbol' | 'version' | 'generatedAt' | 'dataAsOf' | 'priceHistory' | 'sources'> {
  const holdings = values.holdings.sort((left, right) => right.weight - left.weight)
  return {
    ...values,
    holdings,
    holdingsCount: values.holdingsCount || holdings.length,
    topTenWeight: holdings.slice(0, 10).reduce((sum, holding) => sum + holding.weight, 0),
  }
}

export function parseFirstTrust(summaryHtml: string, holdingsHtml: string) {
  const summary = pageText(summaryHtml)
  const holdings = tableHoldings(holdingsHtml)
  return basePacket({
    issuer: 'First Trust',
    fundName: firstMatch(summary, /^(First Trust [^.]{10,160}? Fund)/i) ?? 'First Trust ETF',
    benchmark: firstMatch(summary, /Tracking Index:\s*([^*]{4,180}?)(?:\s{2,}|\*)/i) ?? 'Nasdaq Clean Edge Smart Grid Infrastructure Index',
    strategy: firstMatch(summary, /Investment Objective\/Strategy\s*-\s*([^]{20,700}?)(?:\s+(?:Intraday NAV|Fiscal Year-End|Exchange)\b)/i),
    expenseRatio: extractPercent(summary, 'Total Expense Ratio\\*?'),
    assetsUnderManagement: extractMoney(summary, 'Total Net Assets'),
    rebalanceFrequency: firstMatch(summary, /Rebalance Frequency\s+([A-Za-z]+)/i),
    holdings,
    holdingsCount: Number(firstMatch(holdingsHtml, /Total Number of Holdings \(excluding cash\):\s*(\d+)/i)) || holdings.length,
    topTenWeight: 0,
  })
}

export function parseGlobalX(summaryHtml: string, holdingsHtml: string) {
  const summary = pageText(summaryHtml)
  const holdings = globalXHoldings(holdingsHtml)
  return basePacket({
    issuer: 'Global X',
    fundName: firstMatch(summary, /\b(Global X [^.]{5,160}? ETF)\b/i) ?? 'Global X ETF',
    benchmark: firstMatch(summary, /(?:tracks?|correspond generally to).*?(Solactive[^.]{8,180}?Index)/i),
    strategy: firstMatch(summary, /(provides investors access to[^.]{20,500}\.)/i),
    expenseRatio: extractPercent(summary, '(?:Total )?Expense Ratio'),
    assetsUnderManagement: extractScaledMoney(summary, '(?:Net )?Assets'),
    rebalanceFrequency: firstMatch(summary, /Rebalance(?: Frequency)?\s*[:\-]?\s*([A-Za-z]+)/i),
    holdings,
    holdingsCount: holdings.length,
    topTenWeight: 0,
  })
}

async function loadHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { Accept: 'text/html,application/xhtml+xml', 'User-Agent': 'Stratum/0.5 (+private ETF research worker)' },
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) throw new Error(`ETF issuer request failed (${response.status}) for ${url}`)
  return response.text()
}

async function nextVersion(table: 'etf_research_packets' | 'etf_research_notes', ownerId: string, symbol: string): Promise<number> {
  const supabase = getSupabaseClient()
  if (!supabase) return 1
  const { data } = await supabase.from(table).select('version').eq('owner_id', ownerId).eq('symbol', symbol)
    .order('version', { ascending: false }).limit(1).maybeSingle()
  return Number(data?.version ?? 0) + 1
}

export async function isEtfInstrument(symbolInput: string): Promise<boolean> {
  const symbol = symbolInput.trim().toUpperCase()
  if (ETF_SOURCES[symbol]) return true
  const supabase = getSupabaseClient()
  if (!supabase) return false
  const { data } = await supabase.from('market_assets').select('name').eq('symbol', symbol).maybeSingle()
  return /\b(?:ETF|index fund|exchange[- ]traded fund)\b/i.test(String(data?.name ?? ''))
}

export async function materializeEtfResearchPacket(symbolInput: string, ownerId: string, now = new Date()): Promise<EtfResearchPacket> {
  const symbol = symbolInput.trim().toUpperCase()
  if (!validOwnerId(ownerId)) throw new Error('A persisted authenticated user is required for ETF research ownership')
  const source = ETF_SOURCES[symbol]
  if (!source) throw new Error(`${symbol} is an ETF, but no official issuer adapter is configured yet`)
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const [summaryHtml, stock] = await Promise.all([loadHtml(source.summaryUrl), fetchStockViewerData(symbol, ownerId)])
  const holdingsUrl = source.issuer === 'Global X' ? globalXHoldingsUrl(summaryHtml) : source.holdingsUrl
  const holdingsHtml = holdingsUrl === source.summaryUrl ? summaryHtml : await loadHtml(holdingsUrl)
  if (!stock) throw new Error(`${symbol} is not in the current materialized market universe`)
  const parsed = source.parse(summaryHtml, holdingsHtml, now)
  if (parsed.holdings.length < 5) throw new Error(`${symbol} issuer source did not provide enough holdings for ETF research`)
  const version = await nextVersion('etf_research_packets', ownerId, symbol)
  const generatedAt = now.toISOString()
  const sources = [
    { id: 'issuer-summary', label: `${source.issuer} fund summary`, url: source.summaryUrl, source: source.issuer, asOf: parsed.dataAsOf },
    { id: 'issuer-holdings', label: `${source.issuer} holdings`, url: holdingsUrl, source: source.issuer, asOf: parsed.dataAsOf },
  ]
  const packet: EtfResearchPacket = {
    ...parsed,
    id: '', symbol, version, generatedAt,
    priceHistory: {
      latestPrice: stock.price,
      return30d: stock.return30d,
      return1y: stock.return1y,
      vs50DayAverage: stock.leadership?.vs50DayAverage ?? null,
      vs200DayAverage: stock.leadership?.vs200DayAverage ?? null,
    },
    sources,
  }
  const { data: inserted, error } = await supabase.from('etf_research_packets').insert({
    symbol, owner_id: ownerId, version, status: 'complete', packet,
    source_ids: sources.map((item) => item.id), data_as_of: packet.dataAsOf, generated_at: generatedAt,
  }).select('id').single()
  if (error || !inserted) throw new Error(`Unable to persist ETF research packet: ${error?.message ?? 'unknown error'}`)
  packet.id = inserted.id
  await supabase.from('etf_research_packets').update({ packet }).eq('id', inserted.id)
  return packet
}

interface EtfResearchGeneration {
  formalRating: EtfResearchNote['formalRating']
  entryAction: EtfResearchNote['entryAction']
  investmentThesis: string
  keyDebate: string
  fastestKillSignal: string
  confidence: number
  revision: EquityResearchRevision
  sections: EtfResearchSection[]
  sourceIds: string[]
}

export function validateEtfResearch(value: unknown): EtfResearchGeneration {
  const output = record(value)
  const sections = Array.isArray(output.sections) ? output.sections.map(record) : []
  const ids = sections.map((section) => String(section.id))
  if (sections.length !== ETF_SECTION_IDS.length || ETF_SECTION_IDS.some((id) => !ids.includes(id))) {
    throw new Error('ETF research must contain each of the 12 required sections exactly once')
  }
  const formalRating = output.formalRating as EtfResearchNote['formalRating']
  const entryAction = output.entryAction as EtfResearchNote['entryAction']
  if (!['BUY', 'HOLD', 'SELL', 'NOT_RATED'].includes(formalRating)) throw new Error('Invalid formal rating')
  if (!['buy_now', 'nibble', 'wait', 'add_on_weakness', 'avoid'].includes(entryAction)) throw new Error('Invalid entry action')
  const requiredString = (key: string) => {
    if (typeof output[key] !== 'string' || !output[key]) throw new Error(`Missing ${key}`)
    return output[key] as string
  }
  const confidence = number(output.confidence)
  if (confidence === null || confidence < 0 || confidence > 100) throw new Error('Invalid confidence')
  const wordCount = sections.reduce((total, section) => total + String(section.content ?? '').trim().split(/\s+/).filter(Boolean).length, 0)
  if (wordCount < 1_200 || wordCount > 2_400) throw new Error(`ETF research must contain 1,200-2,400 words of analysis; received ${wordCount}`)
  const revision = record(output.revision)
  const changes = Array.isArray(revision.changes) ? revision.changes.map(record) : []
  const normalizedChanges = changes.flatMap((change) => {
    const field = String(change.field) as EquityResearchRevisionChange['field']
    return ['formal_rating', 'entry_action', 'investment_thesis', 'key_debate', 'kill_criteria', 'evidence'].includes(field)
      ? [{ field, previous: String(change.previous ?? ''), current: String(change.current ?? ''), explanation: String(change.explanation ?? '') }]
      : []
  })
  if (normalizedChanges.length === 0) throw new Error('ETF research revision must contain at least one material evidence change')
  return {
    formalRating, entryAction, investmentThesis: requiredString('investmentThesis'), keyDebate: requiredString('keyDebate'),
    fastestKillSignal: requiredString('fastestKillSignal'), confidence,
    revision: {
      priorVersion: revision.priorVersion === null ? null : number(revision.priorVersion),
      opinionChange: ['initial', 'more_constructive', 'less_constructive', 'unchanged'].includes(String(revision.opinionChange))
        ? revision.opinionChange as EquityResearchRevision['opinionChange'] : 'initial',
      summary: String(revision.summary ?? ''),
      changes: normalizedChanges,
    },
    sections: sections.map((section) => ({
      id: String(section.id) as EtfResearchSectionId,
      title: String(section.title ?? ''), content: String(section.content ?? ''),
      sourceIds: Array.isArray(section.sourceIds) ? section.sourceIds.filter((id): id is string => typeof id === 'string') : [],
    })),
    sourceIds: Array.isArray(output.sourceIds) ? output.sourceIds.filter((id): id is string => typeof id === 'string') : [],
  }
}

function etfResearchPrompt(packet: EtfResearchPacket, prior: EtfResearchNote | null, reason: string): string {
  return [
    'Act as a senior ETF research analyst. Produce an institutional-quality ETF research note for a capital-allocation decision.',
    'This security is a fund, not an operating company. Do not use company financial statements, revenue, earnings transcripts, management commentary, corporate P/E, or forward EPS as if they belonged to the ETF.',
    'Use only the facts and source IDs in the ETF research packet. Never invent holdings, weights, benchmark rules, flows, NAV, AUM, valuation, or citations.',
    'The issuer holdings snapshot is authoritative for what the fund owns. Distinguish issuer facts, constituent look-through inference, and analyst view.',
    'Assess exposure, top-holding concentration, portfolio construction, benchmark/rebalance mechanics, price setup, catalysts, risks, and the practical entry decision. For look-through fundamentals, state when the current packet lacks constituent financial evidence rather than inventing it.',
    'Use BUY/HOLD/SELL separately from today\'s entry action. Use NOT_RATED or wait when fund-level evidence is inadequate.',
    'Return exactly these 12 sections in schema order: Fund Snapshot; Portfolio Exposure; Top Holdings; Index & Rebalance; Fundamentals Look-through; Valuation & Setup; Catalysts; Bull Case; Base Case; Bear Case; Risk Factors; Verdict.',
    'Write 1,400-2,100 words. Prefix each factual, analytical, or estimate paragraph with **FACT:**, **VIEW:** or **ESTIMATE:**. Attach source IDs through sections and sourceIds, never in prose.',
    prior
      ? `This refresh follows version ${prior.version}; preserve supported conclusions and give a structured, evidence-based comparison. Reason: ${reason}.\nPRIOR RESEARCH: ${JSON.stringify(prior)}`
      : `This is the initial version. revision.priorVersion must be null and revision.opinionChange must be initial. Reason: ${reason}.`,
    `ETF RESEARCH PACKET:\n${JSON.stringify(packet)}`,
  ].join('\n')
}

function normalizeEtfResearch(row: Record<string, unknown>): EtfResearchNote {
  const content = record(row.content)
  const revision = record(content.revision)
  const changes = Array.isArray(revision.changes) ? revision.changes.map(record) : []
  return {
    id: String(row.id), symbol: String(row.symbol), version: Number(row.version), status: row.status as EtfResearchNote['status'],
    formalRating: row.formal_rating as EtfResearchNote['formalRating'], entryAction: row.entry_action as EtfResearchNote['entryAction'],
    investmentThesis: String(content.investmentThesis ?? ''), keyDebate: String(content.keyDebate ?? ''), fastestKillSignal: String(content.fastestKillSignal ?? ''),
    confidence: Number(content.confidence ?? 0),
    revision: {
      priorVersion: revision.priorVersion === null ? null : number(revision.priorVersion) ?? (Number(row.version) > 1 ? Number(row.version) - 1 : null),
      opinionChange: ['initial', 'more_constructive', 'less_constructive', 'unchanged'].includes(String(revision.opinionChange))
        ? revision.opinionChange as EquityResearchRevision['opinionChange'] : Number(row.version) > 1 ? 'unchanged' : 'initial',
      summary: String(revision.summary ?? 'Initial ETF research baseline.'),
      changes: changes.map((change) => ({
        field: String(change.field) as EquityResearchRevisionChange['field'], previous: String(change.previous ?? ''),
        current: String(change.current ?? ''), explanation: String(change.explanation ?? ''),
      })),
    },
    sections: Array.isArray(content.sections) ? content.sections as EtfResearchSection[] : [],
    sourceIds: Array.isArray(content.sourceIds) ? content.sourceIds.filter((id): id is string => typeof id === 'string') : [],
    provider: String(row.provider ?? ''), model: String(row.model ?? ''), dataAsOf: String(row.data_as_of), generatedAt: String(row.generated_at),
    error: row.error === null ? null : String(row.error ?? ''),
  }
}

async function fetchLatestCompletedEtfResearch(ownerId: string, symbol: string): Promise<EtfResearchNote | null> {
  const supabase = getSupabaseClient()
  if (!supabase) return null
  const { data } = await supabase.from('etf_research_notes').select('*').eq('owner_id', ownerId).eq('symbol', symbol)
    .eq('status', 'complete').order('version', { ascending: false }).limit(1).maybeSingle()
  return data ? normalizeEtfResearch(data) : null
}

export async function generateEtfResearch(
  symbol: string,
  ownerId: string,
  reason = 'manual',
  onProgress?: (progress: number, phase: string) => Promise<void>,
): Promise<EtfResearchNote> {
  if (!validOwnerId(ownerId)) throw new Error('A persisted authenticated user is required for ETF research ownership')
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const prior = await fetchLatestCompletedEtfResearch(ownerId, symbol)
  await onProgress?.(15, prior ? `Refreshing version ${prior.version} issuer evidence` : 'Collecting issuer holdings')
  const packet = await materializeEtfResearchPacket(symbol, ownerId)
  await onProgress?.(45, 'ETF packet assembled')
  const version = await nextVersion('etf_research_notes', ownerId, symbol)
  const { data: note, error: createError } = await supabase.from('etf_research_notes').insert({
    symbol, owner_id: ownerId, etf_research_packet_id: packet.id, previous_research_note_id: prior?.id ?? null,
    version, status: 'running', data_as_of: packet.dataAsOf,
  }).select('id').single()
  if (createError || !note) throw new Error(`Unable to create ETF research version: ${createError?.message ?? 'unknown error'}`)
  try {
    await onProgress?.(55, 'Synthesizing ETF analysis')
    const result = await runCodexJson({
      prompt: etfResearchPrompt(packet, prior, reason), schemaPath: 'schemas/etf-research.schema.json', validate: validateEtfResearch,
      timeoutMs: 20 * 60 * 1_000,
    })
    await onProgress?.(90, 'Validating and publishing ETF research')
    const generatedAt = new Date().toISOString()
    const content = { ...result.data, reason }
    const { error } = await supabase.from('etf_research_notes').update({
      status: 'complete', formal_rating: result.data.formalRating, entry_action: result.data.entryAction, content,
      provider: result.metadata.provider, model: result.metadata.model, generated_at: generatedAt, error: null,
    }).eq('id', note.id).eq('status', 'running')
    if (error) throw new Error(`Unable to publish ETF research version: ${error.message}`)
    const used = new Set(result.data.sourceIds)
    const { error: sourceError } = await supabase.from('etf_research_sources').insert(packet.sources
      .filter((source) => used.has(source.id)).map((source) => ({ research_note_id: note.id, source_id: source.id, label: source.label, url: source.url, source: source.source, source_as_of: source.asOf })))
    if (sourceError) throw new Error(`Unable to persist ETF research sources: ${sourceError.message}`)
    await onProgress?.(100, 'ETF research complete')
    return { id: note.id, symbol, version, status: 'complete', ...result.data, provider: result.metadata.provider, model: result.metadata.model, dataAsOf: packet.dataAsOf, generatedAt, error: null }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await supabase.from('etf_research_notes').update({ status: 'failed', error: message }).eq('id', note.id)
    throw error
  }
}

export async function fetchLatestEtfResearch(ownerId: string, symbol: string): Promise<EtfResearchNote | null> {
  const supabase = getSupabaseClient()
  if (!supabase || !validOwnerId(ownerId)) return null
  const { data } = await supabase.from('etf_research_notes').select('*').eq('owner_id', ownerId).eq('symbol', symbol)
    .order('version', { ascending: false }).limit(1).maybeSingle()
  return data ? normalizeEtfResearch(data) : null
}

export async function fetchLatestEtfResearchPacket(ownerId: string, symbol: string): Promise<EtfResearchPacket | null> {
  const supabase = getSupabaseClient()
  if (!supabase || !validOwnerId(ownerId)) return null
  const { data } = await supabase.from('etf_research_packets').select('packet').eq('owner_id', ownerId).eq('symbol', symbol)
    .eq('status', 'complete').order('version', { ascending: false }).limit(1).maybeSingle()
  return data && record(data.packet).symbol === symbol ? data.packet as EtfResearchPacket : null
}

export async function fetchEtfResearchLibrary(ownerId: string, limit = 30): Promise<EtfResearchNote[]> {
  const supabase = getSupabaseClient()
  if (!supabase || !validOwnerId(ownerId)) return []
  const { data } = await supabase.from('etf_research_notes').select('*').eq('owner_id', ownerId)
    .order('generated_at', { ascending: false }).limit(limit)
  return (data ?? []).map((row) => normalizeEtfResearch(row))
}
