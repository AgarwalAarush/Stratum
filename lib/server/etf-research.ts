import { startInvestigation } from './research-investigations.ts'
import { hasCurrentResearchContract, validatePacketDecisionSupport } from '../markets/research-contract.ts'
import { feedbackSources, loadResearchFeedback } from './research-feedback.ts'
import { FEEDBACK_RULES, validateFeedbackReview, type FeedbackReview } from '../markets/research-feedback.ts'
import { beginResearchVersion, publishResearchVersion, failResearchVersion } from './research-lifecycle.ts'
import { fetchResearchBaseline, recordResearchRefresh } from './research-refresh.ts'
import { RESEARCH_ADVICE_RULES, readResearchAdvice, validateResearchNarrative, validateResearchAdvice } from '../markets/research-advice.ts'
import { randomUUID } from 'node:crypto'
import { parseStateStreetHoldings } from './etf-workbook.ts'
import { fetchVanEckFund } from './vaneck-holdings.ts'
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

export const ETF_SOURCES: Record<string, IssuerSource> = {
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

for (const symbol of ['PAVE', 'MLPX', 'SHLD']) ETF_SOURCES[symbol] = {
  ...ETF_SOURCES.URA!, summaryUrl: `https://www.globalxetfs.com/funds/${symbol.toLowerCase()}`,
  holdingsUrl: `https://www.globalxetfs.com/funds/${symbol.toLowerCase()}`,
}
ETF_SOURCES.SGOV = {
  issuer: 'iShares',
  summaryUrl: 'https://www.ishares.com/us/products/314116/ishares-0-3-month-treasury-bond-etf',
  holdingsUrl: 'https://www.ishares.com/us/products/314116/ishares-0-3-month-treasury-bond-etf/latest-holdings.csv',
  parse: parseIsharesTreasury,
}

for (const symbol of ['XLK', 'XLU']) ETF_SOURCES[symbol] = {
  issuer: 'State Street', summaryUrl: `https://www.ssga.com/mainfund/${symbol}`,
  holdingsUrl: `https://www.ssga.com/library-content/products/fund-data/etfs/us/holdings-daily-us-en-${symbol.toLowerCase()}.xlsx`,
  parse: () => { throw new Error('State Street requires the complete issuer workbook') },
}
for (const [symbol, slug] of [['NLR','uranium-nuclear-energy-etf-nlr'], ['RACK','data-center-supply-chain-etf-rack']]) ETF_SOURCES[symbol] = {
  issuer: 'VanEck', summaryUrl: `https://www.vaneck.com/us/en/investments/${slug}/`,
  holdingsUrl: `https://www.vaneck.com/us/en/investments/${slug}/`,
  parse: () => { throw new Error('VanEck requires its complete dated holdings component') },
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function number(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function validOwnerId(ownerId: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(ownerId)
}

function parseDecimal(value: string): number | null {
  if (!value.trim() || value.trim() === '-') return null
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

export function extractAsOf(content: string, now: Date): string {
  const text = /<[^>]+>/.test(content) ? pageText(content) : content
  const value = firstMatch(text, /(?:Holdings(?: of the Fund)?|Current Fund Data|Top Holdings|Key Information|Fund Holdings Data)\s*(?:\([^)]*\))?\s*(?:as of)\s*([A-Z][a-z]{2,8}\s+\d{1,2},?\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{4})/i)
  const parsed = value ? Date.parse(`${value} UTC`) : Number.NaN
  if (!Number.isFinite(parsed) || parsed > now.getTime()) throw new Error('Issuer holdings date is missing, invalid or future-dated')
  return new Date(parsed).toISOString()
}

export function etfEvidenceQuality(packet: {holdings: EtfHolding[]; holdingsCount: number; dataAsOf: string}, priceAsOf: string, now: Date) {
  const coveredWeight = packet.holdings.reduce((sum,h) => sum + h.weight, 0)
  const missing: string[] = []
  if (packet.holdings.length < 5 || coveredWeight < 0.95 || coveredWeight > 1.02 || packet.holdings.length < packet.holdingsCount) missing.push('Complete issuer holdings coverage')
  const time = Date.parse(packet.dataAsOf)
  if (!Number.isFinite(time) || time > now.getTime() || now.getTime() - time > 7 * 86400000) missing.push('Current issuer holdings date')
  if (!Number.isFinite(Date.parse(priceAsOf)) || Date.parse(priceAsOf) > now.getTime()) missing.push('Valid market price timestamp')
  return {checkedAt: now.toISOString(), missing, coveredWeight, priceAsOf, holdingsAsOf: packet.dataAsOf}
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
    const symbol = symbols[0] ?? null
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

/** iShares bills share a name: retain CUSIPs and signed cash offsets, not
 * a name-deduplicated equity table. The issuer CSV carries its own date. */
export function parseIsharesTreasury(summaryHtml: string, csv: string, now: Date) {
  const lines = csv.replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim())
  const dateRow = lines.map(csvCells).find(row => row[0] === 'Fund Holdings as of')
  const time = dateRow?.[1] ? Date.parse(`${dateRow[1]} UTC`) : Number.NaN
  if (!Number.isFinite(time) || time > now.getTime()) throw new Error('Issuer holdings date is missing, invalid or future-dated')
  const headerIndex = lines.findIndex(line => csvCells(line)[0] === 'Name' && csvCells(line).includes('Weight (%)'))
  if (headerIndex < 0) throw new Error('iShares holdings CSV header is missing')
  const header = csvCells(lines[headerIndex]!)
  for (const field of ['Sector', 'Asset Class', 'Market Value', 'Weight (%)', 'Par Value', 'CUSIP'])
    if (!header.includes(field)) throw new Error(`iShares holdings column is missing: ${field}`)
  const holdings = lines.slice(headerIndex + 1).flatMap(line => {
    const cells = csvCells(line)
    if (cells.length !== header.length) {
      if (['Cash', 'Money Market', 'Fixed Income'].includes(cells[header.indexOf('Asset Class')] ?? ''))
        throw new Error('Malformed iShares holding columns')
      return [] // issuer footnotes, not holdings
    }
    const get = (field: string) => cells[header.indexOf(field)] ?? ''
    const name = get('Name'), weight = parsePercent(get('Weight (%)'))
    if (!name || weight === null) throw new Error('Invalid iShares holding')
    return [{symbol:null, name, identifier:get('CUSIP') === '-' ? null : get('CUSIP'),
      classification:get('Asset Class'), shares:null,
      marketValue:parseDecimal(get('Market Value')), weight}]
  })
  const {document} = parseHTML(summaryHtml)
  let strategy: string | null = null
  const context = document.querySelector('walrus-context[contextid="productDataContext"]')?.getAttribute('value')
  if (context) {
    const content = record(record(JSON.parse(context)).content)
    const objective = content.fund_objective
    if (Array.isArray(objective)) strategy = String(record(objective[0]).text ?? '') || null
  }
  return {...basePacket({issuer:'iShares',fundName:lines[0]!,benchmark:null,strategy,
    expenseRatio:null,assetsUnderManagement:null,rebalanceFrequency:null,
    holdings,holdingsCount:holdings.length,topTenWeight:0}), dataAsOf:new Date(time).toISOString()}
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
  const [issuer, stock] = await Promise.all([source.issuer === 'VanEck' ? fetchVanEckFund(source.summaryUrl, symbol, now) : loadHtml(source.summaryUrl), fetchStockViewerData(symbol, ownerId)])
  const vanEck = typeof issuer === 'string' ? null : issuer
  const summaryHtml = typeof issuer === 'string' ? issuer : issuer.summaryHtml
  const holdingsUrl = vanEck?.holdingsUrl ?? (source.issuer === 'Global X' ? globalXHoldingsUrl(summaryHtml) : source.holdingsUrl)
  const holdingsHtml = source.issuer === 'State Street' || vanEck ? '' : holdingsUrl === source.summaryUrl ? summaryHtml : await loadHtml(holdingsUrl)
  if (!stock) throw new Error(`${symbol} is not in the current materialized market universe`)
  let parsed: ReturnType<IssuerSource['parse']>
  if (vanEck) {
    parsed = {...basePacket({issuer: 'VanEck', fundName: vanEck.fundName, holdings: vanEck.holdings, holdingsCount: vanEck.holdingsCount,
      strategy: vanEck.strategy, benchmark: null, rebalanceFrequency: null, topTenWeight: 0,
      expenseRatio: vanEck.expenseRatio, assetsUnderManagement: vanEck.assetsUnderManagement}), dataAsOf: vanEck.dataAsOf}
  } else if (source.issuer === 'State Street') {
    const response = await fetch(holdingsUrl, {signal: AbortSignal.timeout(20_000)})
    if (!response.ok) throw new Error(`Issuer workbook request failed (${response.status})`)
    const data = parseStateStreetHoldings(new Uint8Array(await response.arrayBuffer()), symbol)
    parsed = {...basePacket({issuer: source.issuer, fundName: data.fundName, holdings: data.holdings, holdingsCount: data.holdings.length, topTenWeight: 0,
      benchmark: symbol === 'XLK' ? 'Technology Select Sector Index' : 'Utilities Select Sector Index', strategy: null,
      expenseRatio: extractPercent(pageText(summaryHtml), 'Gross Expense Ratio'), assetsUnderManagement: extractMoney(pageText(summaryHtml), 'Assets Under Management'), rebalanceFrequency: null}), dataAsOf: data.dataAsOf}
  } else parsed = source.parse(summaryHtml, holdingsHtml, now)
  if (parsed.holdings.length < 5) throw new Error(`${symbol} issuer source did not provide enough holdings for ETF research`)
  const version = await nextVersion('etf_research_packets', ownerId, symbol)
  const generatedAt = now.toISOString()
  const sources = [
    { id: 'issuer-summary', label: `${source.issuer} fund summary`, url: source.summaryUrl, source: source.issuer, asOf: vanEck?.summaryAsOf ?? parsed.dataAsOf },
    { id: 'issuer-holdings', label: `${source.issuer} holdings`, url: holdingsUrl, source: source.issuer, asOf: parsed.dataAsOf },
  ]
  const outcomeFeedback = await loadResearchFeedback(ownerId, symbol, generatedAt)
  sources.push(...feedbackSources(outcomeFeedback))
  const packet: EtfResearchPacket = {
    outcomeFeedback,
    ...parsed,
    id: randomUUID(), symbol, version, generatedAt,
    evidenceQuality: etfEvidenceQuality(parsed, stock.dataAsOf, now),
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
    id: packet.id, symbol, owner_id: ownerId, version, status: 'complete', packet,
    source_ids: sources.map((item) => item.id), data_as_of: packet.dataAsOf, generated_at: generatedAt,
  }).select('id').single()
  if (error || !inserted) throw new Error(`Unable to persist ETF research packet: ${error?.message ?? 'unknown error'}`)
  return packet
}

interface EtfResearchGeneration {
  feedbackReview?: FeedbackReview | null
  advice?: import('../markets/research-advice.ts').ResearchAdvice | null
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

export function validateEtfResearch(value: unknown, packet?: EtfResearchPacket): EtfResearchGeneration {
  const output = record(value)
  const sections = Array.isArray(output.sections) ? output.sections.map(record) : []
  if (packet) {
    const allowed = new Set(packet.sources.map(s => s.id))
    const cited = Array.isArray(output.sourceIds) ? output.sourceIds : []
    if (!cited.length || cited.some(id => !allowed.has(String(id)))) throw new Error('ETF citation is absent from the source packet')
    for (const section of sections) if (!Array.isArray(section.sourceIds) || section.sourceIds.some(id => !allowed.has(String(id)) || !cited.includes(id))) throw new Error('ETF section citation is absent from the source ledger')
  }
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

  const revision = record(output.revision)
  const changes = Array.isArray(revision.changes) ? revision.changes.map(record) : []
  const normalizedChanges = changes.flatMap((change) => {
    const field = String(change.field) as EquityResearchRevisionChange['field']
    return ['formal_rating', 'entry_action', 'investment_thesis', 'key_debate', 'kill_criteria', 'evidence'].includes(field)
      ? [{ field, previous: String(change.previous ?? ''), current: String(change.current ?? ''), explanation: String(change.explanation ?? '') }]
      : []
  })
  if (normalizedChanges.length > 8 || normalizedChanges.length !== changes.length || normalizedChanges.some(c => !c.explanation.trim())) throw new Error('Invalid ETF research revision changes')
  if (!['initial', 'more_constructive', 'less_constructive', 'unchanged'].includes(String(revision.opinionChange)) || !String(revision.summary ?? '').trim()) throw new Error('Invalid ETF research revision comparison')
  const advice = output.advice || packet ? validateResearchAdvice(output.advice, Array.isArray(output.sourceIds) ? output.sourceIds.map(String) : []) : null
  if (packet) validatePacketDecisionSupport(advice,packet.evidenceQuality?.missing ?? [])
  validateResearchNarrative(advice, sections.filter(s => s.id === 'verdict').map(s => String(s.content ?? '')).join('\n'))
  return {
    feedbackReview: packet?.outcomeFeedback ? validateFeedbackReview(output.feedbackReview, packet.outcomeFeedback) : null,
    advice,
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

export function etfResearchPrompt(packet: EtfResearchPacket, prior: EtfResearchNote | null, reason: string): string {
  return [
    'Act as a senior ETF research analyst. Produce an institutional-quality ETF research note for a capital-allocation decision.',
    'This security is a fund, not an operating company. Do not use company financial statements, revenue, earnings transcripts, management commentary, corporate P/E, or forward EPS as if they belonged to the ETF.',
    'Use only the facts and source IDs in the ETF research packet. Never invent holdings, weights, benchmark rules, flows, NAV, AUM, valuation, or citations.',
    'The issuer holdings snapshot is authoritative for what the fund owns. Distinguish issuer facts, constituent look-through inference, and analyst view.',
    'Assess exposure, top-holding concentration, portfolio construction, benchmark/rebalance mechanics, price setup, catalysts, risks, and the practical entry decision. For look-through fundamentals, state when the current packet lacks constituent financial evidence rather than inventing it.',
    FEEDBACK_RULES,
    RESEARCH_ADVICE_RULES,
    'Use BUY/HOLD/SELL separately from today\'s entry action. Use NOT_RATED or wait when fund-level evidence is inadequate.',
    'Return exactly these 12 sections in schema order: Fund Snapshot; Portfolio Exposure; Top Holdings; Index & Rebalance; Fundamentals Look-through; Valuation & Setup; Catalysts; Bull Case; Base Case; Bear Case; Risk Factors; Verdict.',
    'Use only the length the evidence warrants; do not pad the report. Prefix each factual, analytical, or estimate paragraph with **FACT:**, **VIEW:** or **ESTIMATE:**. Attach source IDs through sections and sourceIds, never in prose.',
    prior
      ? `This refresh follows version ${prior.version}; preserve supported conclusions and give a structured, evidence-based comparison. Use an empty changes array when substantive evidence and conclusion are unchanged. Reason: ${reason}.\nPRIOR RESEARCH: ${JSON.stringify(prior)}`
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
    feedbackReview: content.feedbackReview as FeedbackReview | undefined ?? null,
    advice: readResearchAdvice(content.advice),
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
  forceFullResearch = false,
  investigationKey?: string,
): Promise<EtfResearchNote> {
  if (!validOwnerId(ownerId)) throw new Error('A persisted authenticated user is required for ETF research ownership')
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const prior = await fetchLatestCompletedEtfResearch(ownerId, symbol)
  await onProgress?.(15, prior ? `Refreshing version ${prior.version} issuer evidence` : 'Collecting issuer holdings')
  const previousPacket = prior ? await fetchResearchBaseline(ownerId, 'etf', prior.id) : null
  const packet = await materializeEtfResearchPacket(symbol, ownerId)
  const refresh = await recordResearchRefresh({ownerId,instrument:'etf',packet,priorPacket:previousPacket,prior,reason,conditionsChanged:/kill|entry|invalidation/i.test(reason),forceFullResearch:forceFullResearch || !hasCurrentResearchContract(prior)})
  if (prior && refresh.kind !== 'full_research') { await onProgress?.(100, `Evidence ${refresh.kind}; retained research v${prior.version}`); return prior }
  await startInvestigation(ownerId,symbol,investigationKey)
  await onProgress?.(45, 'ETF packet assembled')
  const note = await beginResearchVersion({kind:'etf',ownerId,symbol,packetId:packet.id,dataAsOf:packet.dataAsOf,previousId:prior?.id??null})
  const version = note.version

  try {
    await onProgress?.(55, 'Synthesizing ETF analysis')
    const result = await runCodexJson({
      prompt: etfResearchPrompt(packet, prior, reason), schemaPath: 'schemas/etf-research.schema.json', validate: value => validateEtfResearch(value, packet),
      timeoutMs: 20 * 60 * 1_000,
    })
    await onProgress?.(90, 'Validating and publishing ETF research')
    const generatedAt = new Date().toISOString()
    const content = { ...result.data, reason }
    await publishResearchVersion({kind:'etf',id:note.id,content,sources:packet.sources,metadata:result.metadata,generatedAt})
    await onProgress?.(100, 'ETF research complete')
    return { id: note.id, symbol, version, status: 'complete', ...result.data, provider: result.metadata.provider, model: result.metadata.model, dataAsOf: packet.dataAsOf, generatedAt, error: null }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await failResearchVersion('etf',note.id,message)
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
