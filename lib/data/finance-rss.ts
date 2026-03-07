import type { NewsItem } from '../types.ts'
import { cachedFetchWithFallback } from '../server/cache.ts'
import { hashString, parseFeedXml, type ParsedFeedItem } from './rss-parser.ts'

export interface FinanceFeed {
  name: string
  url: string
}

interface CollectFeedOptions {
  limit?: number
  overallDeadlineMs?: number
  feedTimeoutMs?: number
  batchConcurrency?: number
}

const DEFAULT_LIMIT = 30
const DEFAULT_FEED_TIMEOUT_MS = 8_000
const DEFAULT_OVERALL_DEADLINE_MS = 25_000
const DEFAULT_BATCH_CONCURRENCY = 12

export const FINANCE_LOOKBACK_DAYS = 14
export const FINANCE_FORWARD_DAYS = 14

const TRACKING_QUERY_PARAMS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'gclid',
  'fbclid',
  'guccounter',
]

export const financeGoogleNewsRss = (query: string) =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function normalizeTitleForDedupe(value: string): string {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
}

function canonicalizeUrl(url: string): string {
  const trimmed = url.trim()
  if (!trimmed) return ''

  try {
    const parsed = new URL(trimmed)
    for (const param of TRACKING_QUERY_PARAMS) {
      parsed.searchParams.delete(param)
    }
    parsed.hash = ''
    return parsed.toString()
  } catch {
    return trimmed.toLowerCase()
  }
}

export function safeIso(value: string | number | Date): string | null {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

export function isWithinPastDays(
  isoString: string,
  days: number = FINANCE_LOOKBACK_DAYS,
  now: Date = new Date(),
): boolean {
  const timestamp = new Date(isoString).getTime()
  if (Number.isNaN(timestamp)) return false

  const lookbackMs = days * 24 * 60 * 60 * 1_000
  const delta = now.getTime() - timestamp
  return delta >= 0 && delta <= lookbackMs
}

export function isWithinRelativeWindow(
  isoString: string,
  lookbackDays: number = FINANCE_LOOKBACK_DAYS,
  forwardDays: number = FINANCE_FORWARD_DAYS,
  now: Date = new Date(),
): boolean {
  const timestamp = new Date(isoString).getTime()
  if (Number.isNaN(timestamp)) return false

  const min = now.getTime() - lookbackDays * 24 * 60 * 60 * 1_000
  const max = now.getTime() + forwardDays * 24 * 60 * 60 * 1_000
  return timestamp >= min && timestamp <= max
}

export function dedupeNewsItems(items: NewsItem[]): NewsItem[] {
  const seen = new Set<string>()
  const deduped: NewsItem[] = []

  for (const item of items) {
    const key = `${normalizeTitleForDedupe(item.title)}|${canonicalizeUrl(item.url)}`
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(item)
  }

  return deduped
}

function dedupeParsedItems(items: ParsedFeedItem[]): ParsedFeedItem[] {
  const seen = new Set<string>()
  const deduped: ParsedFeedItem[] = []

  for (const item of items) {
    const key = `${normalizeTitleForDedupe(item.title)}|${canonicalizeUrl(item.link)}`
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(item)
  }

  return deduped
}

async function fetchRssText(
  url: string,
  timeoutMs: number,
  signal: AbortSignal,
): Promise<string | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const abortListener = () => controller.abort()

  signal.addEventListener('abort', abortListener, { once: true })

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/rss+xml, application/xml, text/xml, */*',
        'User-Agent': 'Stratum/0.2 (+finance-feed-ingestion)',
      },
      signal: controller.signal,
    })

    if (!response.ok) return null
    return await response.text()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', abortListener)
  }
}

async function fetchSingleFeed(
  feed: FinanceFeed,
  timeoutMs: number,
  signal: AbortSignal,
): Promise<ParsedFeedItem[]> {
  const result = await cachedFetchWithFallback<ParsedFeedItem[]>({
    key: `rss:feed:v2:${feed.url}`,
    ttlSeconds: 600,
    staleMaxAgeMs: 6 * 60 * 60 * 1_000,
    fetcher: async () => {
      const xml = await fetchRssText(feed.url, timeoutMs, signal)
      if (!xml) return null

      const parsed = parseFeedXml(xml, feed.name)
      return parsed.length > 0 ? parsed : null
    },
  })

  return result.data ?? []
}

export async function collectFinanceFeedItems(
  feeds: FinanceFeed[],
  options: CollectFeedOptions = {},
): Promise<ParsedFeedItem[]> {
  if (feeds.length === 0) return []

  const {
    limit = DEFAULT_LIMIT,
    overallDeadlineMs = DEFAULT_OVERALL_DEADLINE_MS,
    feedTimeoutMs = DEFAULT_FEED_TIMEOUT_MS,
    batchConcurrency = DEFAULT_BATCH_CONCURRENCY,
  } = options

  const deadlineController = new AbortController()
  const deadlineTimeout = setTimeout(() => deadlineController.abort(), overallDeadlineMs)

  try {
    const collected: ParsedFeedItem[] = []

    for (let i = 0; i < feeds.length; i += batchConcurrency) {
      if (deadlineController.signal.aborted) break

      const batch = feeds.slice(i, i + batchConcurrency)
      const settled = await Promise.allSettled(
        batch.map((feed) => fetchSingleFeed(feed, feedTimeoutMs, deadlineController.signal)),
      )

      for (const result of settled) {
        if (result.status === 'fulfilled') {
          collected.push(...result.value)
        }
      }
    }

    const deduped = dedupeParsedItems(collected)
    deduped.sort((a, b) => b.publishedAt - a.publishedAt)
    return deduped.slice(0, limit)
  } finally {
    clearTimeout(deadlineTimeout)
  }
}

export function parsedToNewsItem(item: ParsedFeedItem, category: string): NewsItem {
  return {
    type: 'news',
    id: `news-${hashString(`${category}:${item.id}`)}`,
    title: normalizeWhitespace(item.title),
    source: item.source,
    category,
    publishedAt: new Date(item.publishedAt).toISOString(),
    url: item.link || '#',
  }
}

export function compareByRecencyDesc(aIso: string, bIso: string): number {
  return new Date(bIso).getTime() - new Date(aIso).getTime()
}
