import type { NewsItem } from '../types.ts'
import {
  FINANCE_LOOKBACK_DAYS,
  collectFinanceFeedItems,
  compareByRecencyDesc,
  dedupeNewsItems,
  financeGoogleNewsRss,
  isWithinPastDays,
  parsedToNewsItem,
  safeIso,
  type FinanceFeed,
} from './finance-rss.ts'
import { hashString } from './rss-parser.ts'

interface FredObservation {
  date?: string
  value?: string
}

interface FredObservationsResponse {
  observations?: FredObservation[]
}

interface FredSeriesDef {
  id: string
  label: string
  source: string
}

const DEFAULT_LIMIT = 20

const FRED_SERIES: FredSeriesDef[] = [
  { id: 'CPIAUCSL', label: 'CPI', source: 'FRED / BLS' },
  { id: 'PCEPI', label: 'PCE', source: 'FRED / BEA' },
  { id: 'UNRATE', label: 'Unemployment', source: 'FRED / BLS' },
  { id: 'FEDFUNDS', label: 'Fed Funds Rate', source: 'FRED / FOMC' },
]

const MACRO_FALLBACK_FEEDS: FinanceFeed[] = [
  {
    name: 'Federal Reserve Press Releases',
    url: 'https://www.federalreserve.gov/feeds/press_monetary.xml',
  },
  {
    name: 'BLS CPI',
    url: 'https://www.bls.gov/feed/news_release/cpi.rss',
  },
  {
    name: 'Google News Macro',
    url: financeGoogleNewsRss('(CPI OR inflation OR FOMC OR payrolls OR unemployment OR PCE) when:14d'),
  },
]

function parseNumericValue(raw: string | undefined): number | null {
  if (!raw || raw === '.') return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : null
}

function classifyMacroCategory(title: string): string {
  const normalized = title.toLowerCase()
  if (/(fomc|federal reserve|fed funds|interest rate)/.test(normalized)) return 'Rates'
  if (/(cpi|inflation|pce)/.test(normalized)) return 'Inflation'
  if (/(employment|unemployment|payroll)/.test(normalized)) return 'Labor'
  return 'Macro'
}

function formatMacroTitle(series: FredSeriesDef, date: string, latest: number, prior: number | null): string {
  const delta = prior === null ? null : latest - prior
  const deltaLabel = delta === null
    ? 'no prior'
    : `${delta >= 0 ? '+' : ''}${delta.toFixed(2)} vs prior`

  return `${series.label} (${date}): ${latest.toFixed(2)} (${deltaLabel})`
}

async function fetchFredSeriesItem(
  series: FredSeriesDef,
  apiKey: string,
): Promise<NewsItem | null> {
  const params = new URLSearchParams({
    series_id: series.id,
    api_key: apiKey,
    file_type: 'json',
    sort_order: 'desc',
    limit: '3',
  })

  const url = `https://api.stlouisfed.org/fred/series/observations?${params.toString()}`

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      headers: { 'User-Agent': 'Stratum/0.2' },
    })

    if (!response.ok) return null

    const payload = (await response.json()) as FredObservationsResponse
    const observations = Array.isArray(payload.observations) ? payload.observations : []

    const withValues = observations
      .map((observation) => ({
        date: observation.date,
        value: parseNumericValue(observation.value),
      }))
      .filter((entry): entry is { date: string; value: number } => Boolean(entry.date) && entry.value !== null)

    if (withValues.length === 0) return null

    const latest = withValues[0]
    const prior = withValues[1] ?? null

    const publishedAt = safeIso(`${latest.date}T00:00:00Z`)
    if (!publishedAt || !isWithinPastDays(publishedAt, FINANCE_LOOKBACK_DAYS)) {
      return null
    }

    return {
      type: 'news',
      id: `news-${hashString(`fred:${series.id}:${latest.date}`)}`,
      title: formatMacroTitle(series, latest.date, latest.value, prior?.value ?? null),
      source: series.source,
      category: classifyMacroCategory(series.label),
      publishedAt,
      url: `https://fred.stlouisfed.org/series/${series.id}`,
    }
  } catch {
    return null
  }
}

async function fetchFredMacroItems(): Promise<NewsItem[]> {
  const apiKey = process.env.FRED_API_KEY
  if (!apiKey) return []

  const settled = await Promise.allSettled(FRED_SERIES.map((series) => fetchFredSeriesItem(series, apiKey)))

  const items: NewsItem[] = []
  for (const result of settled) {
    if (result.status === 'fulfilled' && result.value) {
      items.push(result.value)
    }
  }

  return items
}

async function fetchFallbackMacroItems(): Promise<NewsItem[]> {
  const feedItems = await collectFinanceFeedItems(MACRO_FALLBACK_FEEDS, { limit: 90 })

  return feedItems
    .map((item) => parsedToNewsItem(item, 'Macro'))
    .filter((item) => isWithinPastDays(item.publishedAt, FINANCE_LOOKBACK_DAYS))
    .map((item) => ({
      ...item,
      category: classifyMacroCategory(item.title),
    }))
}

function macroPriority(category: string | undefined): number {
  switch (category) {
    case 'Rates':
      return 4
    case 'Inflation':
      return 3
    case 'Labor':
      return 2
    default:
      return 1
  }
}

function sortMacro(a: NewsItem, b: NewsItem): number {
  const categoryDelta = macroPriority(b.category) - macroPriority(a.category)
  if (categoryDelta !== 0) return categoryDelta

  const recency = compareByRecencyDesc(a.publishedAt, b.publishedAt)
  if (recency !== 0) return recency

  return a.title.localeCompare(b.title)
}

export async function fetchMacroIndicators(limit: number = DEFAULT_LIMIT): Promise<NewsItem[]> {
  const [fredItems, fallbackItems] = await Promise.all([
    fetchFredMacroItems(),
    fetchFallbackMacroItems(),
  ])

  const deduped = dedupeNewsItems([...fredItems, ...fallbackItems])
    .sort(sortMacro)

  return deduped.slice(0, limit)
}
