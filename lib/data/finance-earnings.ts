import type { EarningsItem } from '../types'
import { hashString, type ParsedFeedItem } from './rss-parser.ts'
import {
  FINANCE_FORWARD_DAYS,
  FINANCE_LOOKBACK_DAYS,
  collectFinanceFeedItems,
  compareByRecencyDesc,
  financeGoogleNewsRss,
  isWithinRelativeWindow,
  normalizeWhitespace,
  safeIso,
  type FinanceFeed,
} from './finance-rss.ts'

interface FmpEarningsCalendarRow {
  symbol?: string
  name?: string
  date?: string
  fiscalDateEnding?: string
  eps?: number | string | null
  epsEstimated?: number | string | null
  revenue?: number | string | null
  revenueEstimated?: number | string | null
}

interface KnownCompany {
  ticker: string
  companyName: string
  aliases: string[]
}

interface FetchEarningsOptions {
  calendarStyle?: boolean
  now?: Date
}

const DEFAULT_LIMIT = 20

const EARNINGS_FALLBACK_FEEDS: FinanceFeed[] = [
  {
    name: 'Google News Earnings',
    url: financeGoogleNewsRss('(earnings OR "quarterly results" OR EPS) (NYSE OR Nasdaq OR S&P 500) when:7d'),
  },
  {
    name: 'Google News Earnings Beats/Misses',
    url: financeGoogleNewsRss('("beats estimates" OR "misses estimates" OR "earnings beat" OR "earnings miss") when:7d'),
  },
  {
    name: 'Google News Upcoming Earnings',
    url: financeGoogleNewsRss('("reports earnings" OR "earnings preview" OR "earnings calendar") when:7d'),
  },
]

const KNOWN_COMPANIES: KnownCompany[] = [
  { ticker: 'AAPL', companyName: 'Apple Inc', aliases: ['apple'] },
  { ticker: 'MSFT', companyName: 'Microsoft Corp', aliases: ['microsoft'] },
  { ticker: 'GOOGL', companyName: 'Alphabet Inc', aliases: ['alphabet', 'google'] },
  { ticker: 'AMZN', companyName: 'Amazon.com Inc', aliases: ['amazon'] },
  { ticker: 'META', companyName: 'Meta Platforms Inc', aliases: ['meta', 'facebook'] },
  { ticker: 'NVDA', companyName: 'NVIDIA Corp', aliases: ['nvidia'] },
  { ticker: 'TSLA', companyName: 'Tesla Inc', aliases: ['tesla'] },
  { ticker: 'NFLX', companyName: 'Netflix Inc', aliases: ['netflix'] },
  { ticker: 'AMD', companyName: 'Advanced Micro Devices', aliases: ['amd', 'advanced micro devices'] },
  { ticker: 'INTC', companyName: 'Intel Corp', aliases: ['intel'] },
  { ticker: 'JPM', companyName: 'JPMorgan Chase', aliases: ['jpmorgan', 'jp morgan'] },
  { ticker: 'BAC', companyName: 'Bank of America', aliases: ['bank of america'] },
  { ticker: 'GS', companyName: 'Goldman Sachs', aliases: ['goldman sachs'] },
  { ticker: 'V', companyName: 'Visa Inc', aliases: ['visa'] },
  { ticker: 'MA', companyName: 'Mastercard Inc', aliases: ['mastercard'] },
  { ticker: 'WMT', companyName: 'Walmart Inc', aliases: ['walmart'] },
  { ticker: 'COST', companyName: 'Costco Wholesale', aliases: ['costco'] },
  { ticker: 'XOM', companyName: 'Exxon Mobil', aliases: ['exxon', 'exxon mobil'] },
  { ticker: 'CVX', companyName: 'Chevron Corp', aliases: ['chevron'] },
  { ticker: 'PFE', companyName: 'Pfizer Inc', aliases: ['pfizer'] },
]

function parseNumber(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined
  }

  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, '').trim())
    return Number.isFinite(parsed) ? parsed : undefined
  }

  return undefined
}

function formatQuarterLabel(dateIso: string): string {
  const date = new Date(dateIso)
  if (Number.isNaN(date.getTime())) return 'Quarterly Results'

  const quarter = Math.floor(date.getUTCMonth() / 3) + 1
  const year = date.getUTCFullYear()
  return `Q${quarter} ${year}`
}

function parseQuarterFromTitle(title: string): string | null {
  const normalized = normalizeWhitespace(title)

  const explicitQuarter = normalized.match(/\bQ([1-4])\s*(?:FY)?\s*(20\d{2})\b/i)
  if (explicitQuarter?.[1] && explicitQuarter?.[2]) {
    return `Q${explicitQuarter[1]} ${explicitQuarter[2]}`
  }

  const fiscalQuarter = normalized.match(/\b(?:FY|fiscal)\s*(20\d{2})\s*Q([1-4])\b/i)
  if (fiscalQuarter?.[1] && fiscalQuarter?.[2]) {
    return `Q${fiscalQuarter[2]} ${fiscalQuarter[1]}`
  }

  return null
}

function inferBeatFromTitle(title: string): boolean | undefined {
  const normalized = title.toLowerCase()

  if (/\b(beat|beats|tops|surpass|above\s+expectations|better\s+than\s+expected)\b/.test(normalized)) {
    return true
  }

  if (/\b(miss|misses|missed|below\s+expectations|falls\s+short|weaker\s+than\s+expected)\b/.test(normalized)) {
    return false
  }

  return undefined
}

function findKnownCompany(title: string): KnownCompany | null {
  const normalized = title.toLowerCase()

  for (const company of KNOWN_COMPANIES) {
    if (company.aliases.some((alias) => normalized.includes(alias))) {
      return company
    }
  }

  return null
}

function extractTickerFromTitle(title: string): string | null {
  const byExchange = title.match(/\b(?:NYSE|NASDAQ|Nasdaq|Nyse)[:\s]+([A-Z]{1,5})\b/)
  if (byExchange?.[1]) return byExchange[1].toUpperCase()

  const inParens = title.match(/\(([A-Z]{1,5})\)/)
  if (inParens?.[1]) return inParens[1].toUpperCase()

  const byVerb = title.match(/\b([A-Z]{1,5})\b\s+(?:reports|posts|beats|misses|guides)\b/i)
  if (byVerb?.[1]) return byVerb[1].toUpperCase()

  const known = findKnownCompany(title)
  return known?.ticker ?? null
}

function buildEarningsUrl(ticker: string): string {
  return `https://finance.yahoo.com/quote/${ticker}/earnings`
}

function normalizeFmpRow(row: FmpEarningsCalendarRow): EarningsItem | null {
  const ticker = row.symbol?.trim().toUpperCase()
  const rawDate = row.date?.trim()
  if (!ticker || !rawDate) return null

  const reportDate = safeIso(rawDate)
  if (!reportDate) return null

  const epsActual = parseNumber(row.eps)
  const epsEstimate = parseNumber(row.epsEstimated)
  const revenueActual = parseNumber(row.revenue)
  const revenueEstimate = parseNumber(row.revenueEstimated)

  let beat: boolean | undefined
  if (epsActual !== undefined && epsEstimate !== undefined) {
    beat = epsActual >= epsEstimate
  }

  const fiscalDateIso = row.fiscalDateEnding ? safeIso(row.fiscalDateEnding) : null
  const quarter = fiscalDateIso ? formatQuarterLabel(fiscalDateIso) : formatQuarterLabel(reportDate)

  return {
    type: 'earnings',
    id: `earn-${hashString(`${ticker}:${reportDate}`)}`,
    ticker,
    companyName: row.name?.trim() || ticker,
    quarter,
    reportDate,
    epsActual,
    epsEstimate,
    revenueActual,
    revenueEstimate,
    beat,
    url: buildEarningsUrl(ticker),
  }
}

async function fetchFmpEarnings(now: Date): Promise<EarningsItem[]> {
  const apiKey = process.env.FMP_API_KEY
  if (!apiKey) return []

  const from = new Date(now.getTime() - FINANCE_LOOKBACK_DAYS * 24 * 60 * 60 * 1_000)
  const to = new Date(now.getTime() + FINANCE_FORWARD_DAYS * 24 * 60 * 60 * 1_000)

  const params = new URLSearchParams({
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    apikey: apiKey,
  })

  const url = `https://financialmodelingprep.com/api/v3/earning_calendar?${params.toString()}`

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(12_000),
      headers: { 'User-Agent': 'Stratum/0.2' },
    })

    if (!response.ok) return []

    const payload = (await response.json()) as unknown
    if (!Array.isArray(payload)) return []

    const normalized = payload
      .map((entry) => normalizeFmpRow(entry as FmpEarningsCalendarRow))
      .filter((entry): entry is EarningsItem => entry !== null)

    return normalized.filter((entry) => isWithinRelativeWindow(entry.reportDate, FINANCE_LOOKBACK_DAYS, FINANCE_FORWARD_DAYS, now))
  } catch {
    return []
  }
}

function normalizeFallbackEarnings(item: ParsedFeedItem, now: Date): EarningsItem | null {
  const title = normalizeWhitespace(item.title)
  const ticker = extractTickerFromTitle(title)
  if (!ticker) return null

  const reportDateIso = safeIso(item.publishedAt)
  if (!reportDateIso || !isWithinRelativeWindow(reportDateIso, FINANCE_LOOKBACK_DAYS, FINANCE_FORWARD_DAYS, now)) {
    return null
  }

  const company = KNOWN_COMPANIES.find((entry) => entry.ticker === ticker)
  const quarter = parseQuarterFromTitle(title) ?? formatQuarterLabel(reportDateIso)

  return {
    type: 'earnings',
    id: `earn-${hashString(`fallback:${ticker}:${item.id}`)}`,
    ticker,
    companyName: company?.companyName ?? ticker,
    quarter,
    reportDate: reportDateIso,
    beat: inferBeatFromTitle(title),
    url: item.link || buildEarningsUrl(ticker),
  }
}

async function fetchFallbackEarnings(now: Date): Promise<EarningsItem[]> {
  const feedItems = await collectFinanceFeedItems(EARNINGS_FALLBACK_FEEDS, { limit: 60 })

  return feedItems
    .map((item) => normalizeFallbackEarnings(item, now))
    .filter((item): item is EarningsItem => item !== null)
}

function dedupeEarnings(items: EarningsItem[]): EarningsItem[] {
  const byKey = new Map<string, EarningsItem>()

  for (const item of items) {
    const dateKey = item.reportDate.slice(0, 10)
    const key = `${item.ticker}|${dateKey}`
    const existing = byKey.get(key)

    if (!existing) {
      byKey.set(key, item)
      continue
    }

    const existingHasEps = existing.epsActual !== undefined && existing.epsEstimate !== undefined
    const nextHasEps = item.epsActual !== undefined && item.epsEstimate !== undefined

    if (!existingHasEps && nextHasEps) {
      byKey.set(key, item)
      continue
    }

    if (nextHasEps === existingHasEps && compareByRecencyDesc(existing.reportDate, item.reportDate) > 0) {
      byKey.set(key, item)
    }
  }

  return [...byKey.values()]
}

function earningsSurpriseMagnitude(item: EarningsItem): number {
  if (item.epsActual === undefined || item.epsEstimate === undefined || item.epsEstimate === 0) {
    return 0
  }

  return Math.abs((item.epsActual - item.epsEstimate) / Math.abs(item.epsEstimate))
}

function compareEarnings(
  a: EarningsItem,
  b: EarningsItem,
  calendarStyle: boolean,
  now: Date,
): number {
  const nowMs = now.getTime()
  const aTs = new Date(a.reportDate).getTime()
  const bTs = new Date(b.reportDate).getTime()
  const aUpcoming = aTs >= nowMs
  const bUpcoming = bTs >= nowMs

  if (calendarStyle && aUpcoming !== bUpcoming) {
    return aUpcoming ? -1 : 1
  }

  if (calendarStyle && aUpcoming && bUpcoming) {
    if (aTs !== bTs) return aTs - bTs
    return a.ticker.localeCompare(b.ticker)
  }

  const surpriseDelta = earningsSurpriseMagnitude(b) - earningsSurpriseMagnitude(a)
  if (surpriseDelta !== 0) return surpriseDelta

  if (bTs !== aTs) return bTs - aTs
  return a.ticker.localeCompare(b.ticker)
}

export async function fetchFinanceEarnings(
  limit: number = DEFAULT_LIMIT,
  options: FetchEarningsOptions = {},
): Promise<EarningsItem[]> {
  const now = options.now ?? new Date()
  const calendarStyle = options.calendarStyle ?? false

  const [fmpItems, fallbackItems] = await Promise.all([
    fetchFmpEarnings(now),
    fetchFallbackEarnings(now),
  ])

  const combined = dedupeEarnings([...fmpItems, ...fallbackItems])
    .filter((item) => isWithinRelativeWindow(item.reportDate, FINANCE_LOOKBACK_DAYS, FINANCE_FORWARD_DAYS, now))
    .sort((a, b) => compareEarnings(a, b, calendarStyle, now))

  return combined.slice(0, limit)
}
