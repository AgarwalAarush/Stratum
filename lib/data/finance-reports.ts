import type { NewsItem } from '../types'
import {
  FINANCE_LOOKBACK_DAYS,
  collectFinanceFeedItems,
  compareByRecencyDesc,
  dedupeNewsItems,
  financeGoogleNewsRss,
  isWithinPastDays,
  parsedToNewsItem,
  type FinanceFeed,
} from './finance-rss.ts'

const DEFAULT_LIMIT = 20

const REPORT_FEEDS: FinanceFeed[] = [
  {
    name: 'ARK Invest',
    url: 'https://ark-invest.com/feed/',
  },
  {
    name: 'a16z',
    url: 'https://a16z.com/feed/',
  },
  {
    name: 'Coinbase Research',
    url: 'https://www.coinbase.com/blog/rss',
  },
  {
    name: 'Google News Macro Research',
    url: financeGoogleNewsRss('(research report OR market outlook OR investor note) (goldman sachs OR morgan stanley OR delphi digital) when:14d'),
  },
  {
    name: 'Google News VC Research',
    url: financeGoogleNewsRss('(site:a16z.com OR site:ark-invest.com OR site:delphidigital.io OR site:citriniresearch.com) (report OR outlook OR thesis) when:14d'),
  },
]

function categoryForReport(source: string): string {
  const normalized = source.toLowerCase()

  if (normalized.includes('ark')) return 'ARK Research'
  if (normalized.includes('a16z')) return 'a16z Research'
  if (normalized.includes('delphi')) return 'Delphi Research'
  if (normalized.includes('citrini')) return 'Citrini Research'
  return 'Research Report'
}

function normalizeReportItem(item: NewsItem): NewsItem {
  return {
    ...item,
    category: categoryForReport(item.source),
  }
}

export async function fetchFinanceReports(limit: number = DEFAULT_LIMIT): Promise<NewsItem[]> {
  const feedItems = await collectFinanceFeedItems(REPORT_FEEDS, { limit: 120 })

  const normalized = feedItems
    .map((item) => parsedToNewsItem(item, 'Research Report'))
    .filter((item) => isWithinPastDays(item.publishedAt, FINANCE_LOOKBACK_DAYS))
    .map(normalizeReportItem)

  const deduped = dedupeNewsItems(normalized)
    .sort((a, b) => {
      const recency = compareByRecencyDesc(a.publishedAt, b.publishedAt)
      if (recency !== 0) return recency
      return a.title.localeCompare(b.title)
    })

  return deduped.slice(0, limit)
}
