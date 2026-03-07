import type { NewsItem } from '../types.ts'
import {
  FINANCE_LOOKBACK_DAYS,
  collectFinanceFeedItems,
  compareByRecencyDesc,
  dedupeNewsItems,
  financeGoogleNewsRss,
  isWithinPastDays,
  normalizeWhitespace,
  parsedToNewsItem,
  safeIso,
  type FinanceFeed,
} from './finance-rss.ts'
import { hashString } from './rss-parser.ts'

interface FmpDealLikeItem {
  title?: string
  url?: string
  publishedDate?: string
  published_date?: string
  date?: string
  site?: string
  text?: string
}

const DEFAULT_LIMIT = 20

const DEAL_KEYWORDS = [
  'merger',
  'acquisition',
  'buyout',
  'deal',
  'ipo',
  'spac',
  'raises',
  'raised',
  'funding',
  'series a',
  'series b',
  'series c',
  'series d',
  'valuation',
  'stake',
  'joint venture',
  'partnership',
]

const DEAL_FEEDS: FinanceFeed[] = [
  {
    name: 'Google News M&A',
    url: financeGoogleNewsRss('("merger" OR "acquisition" OR buyout OR "strategic deal") (finance OR markets) when:14d'),
  },
  {
    name: 'Google News IPO',
    url: financeGoogleNewsRss('(IPO OR "initial public offering" OR SPAC listing) (NYSE OR Nasdaq) when:14d'),
  },
  {
    name: 'Google News Funding',
    url: financeGoogleNewsRss('("raises" OR "funding round" OR "Series A" OR "Series B" OR valuation) (fintech OR startup) when:14d'),
  },
  {
    name: 'Reuters Business',
    url: 'https://feeds.reuters.com/reuters/businessNews',
  },
  {
    name: 'MarketWatch Top Stories',
    url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories',
  },
]

function matchesDealSignal(value: string): boolean {
  const normalized = value.toLowerCase()
  return DEAL_KEYWORDS.some((keyword) => normalized.includes(keyword))
}

function classifyDealCategory(title: string): string {
  const normalized = title.toLowerCase()

  if (/(merger|acquisition|buyout|takeover|all-cash deal|stock deal)/.test(normalized)) {
    return 'M&A'
  }

  if (/(ipo|initial public offering|spac|listing|goes public)/.test(normalized)) {
    return 'IPO'
  }

  if (/(raises|raised|funding|series [a-z]|valuation|venture round)/.test(normalized)) {
    return 'Funding'
  }

  if (/(private equity|stake|minority stake|majority stake)/.test(normalized)) {
    return 'Private Equity'
  }

  if (/(joint venture|partnership|strategic partnership)/.test(normalized)) {
    return 'Partnership'
  }

  return 'Deals'
}

function categoryPriority(category: string): number {
  switch (category) {
    case 'M&A':
      return 6
    case 'IPO':
      return 5
    case 'Private Equity':
      return 4
    case 'Funding':
      return 3
    case 'Partnership':
      return 2
    default:
      return 1
  }
}

function toDealNewsItem(item: NewsItem): NewsItem {
  const category = classifyDealCategory(item.title)
  return {
    ...item,
    category,
  }
}

function normalizeFmpDealItem(entry: FmpDealLikeItem): NewsItem | null {
  if (!entry.title || !entry.url) return null

  const title = normalizeWhitespace(entry.title)
  if (!matchesDealSignal(title)) return null

  const rawDate = entry.publishedDate ?? entry.published_date ?? entry.date
  const publishedAt = rawDate ? safeIso(rawDate) : null
  if (!publishedAt || !isWithinPastDays(publishedAt, FINANCE_LOOKBACK_DAYS)) return null

  return {
    type: 'news',
    id: `news-${hashString(`fmp-deal:${title}:${entry.url}`)}`,
    title,
    source: entry.site?.trim() || 'FMP News',
    category: classifyDealCategory(title),
    publishedAt,
    url: entry.url,
  }
}

function normalizeFmpPayload(payload: unknown): NewsItem[] {
  if (!Array.isArray(payload)) return []

  return payload
    .map((entry) => normalizeFmpDealItem(entry as FmpDealLikeItem))
    .filter((item): item is NewsItem => item !== null)
}

async function fetchFmpDeals(): Promise<NewsItem[]> {
  const apiKey = process.env.FMP_API_KEY
  if (!apiKey) return []

  const candidateUrls = [
    `https://financialmodelingprep.com/api/v4/mergers-acquisitions-rss-feed?page=0&apikey=${apiKey}`,
    `https://financialmodelingprep.com/stable/news/mergers-acquisitions?apikey=${apiKey}&limit=50`,
    `https://financialmodelingprep.com/api/v3/stock_news?limit=100&apikey=${apiKey}`,
  ]

  for (const url of candidateUrls) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(10_000),
        headers: { 'User-Agent': 'Stratum/0.2' },
      })

      if (!response.ok) continue
      const payload = (await response.json()) as unknown
      const normalized = normalizeFmpPayload(payload)
      if (normalized.length > 0) return normalized
    } catch {
      // Try next endpoint.
    }
  }

  return []
}

function sortDeals(a: NewsItem, b: NewsItem): number {
  const categoryDelta = categoryPriority(b.category ?? '') - categoryPriority(a.category ?? '')
  if (categoryDelta !== 0) return categoryDelta

  const recency = compareByRecencyDesc(a.publishedAt, b.publishedAt)
  if (recency !== 0) return recency

  return a.title.localeCompare(b.title)
}

export async function fetchFinanceDeals(limit: number = DEFAULT_LIMIT): Promise<NewsItem[]> {
  const [feedItems, providerItems] = await Promise.all([
    collectFinanceFeedItems(DEAL_FEEDS, { limit: 100 }),
    fetchFmpDeals(),
  ])

  const fromFeeds = feedItems
    .map((item) => parsedToNewsItem(item, 'Deals'))
    .filter((item) => matchesDealSignal(item.title))
    .filter((item) => isWithinPastDays(item.publishedAt, FINANCE_LOOKBACK_DAYS))
    .map(toDealNewsItem)

  const deduped = dedupeNewsItems([...providerItems, ...fromFeeds])
    .sort(sortDeals)

  return deduped.slice(0, limit)
}
