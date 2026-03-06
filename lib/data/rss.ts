import type { NewsItem } from '../types'
import { cachedFetchWithFallback } from '../server/cache'

export interface ServerFeed {
  name: string
  url: string
}

export interface ParsedFeedItem {
  id: string
  source: string
  title: string
  link: string
  publishedAt: number
}

const FEED_TIMEOUT_MS = 8_000
const OVERALL_DEADLINE_MS = 25_000
const BATCH_CONCURRENCY = 20
const ITEMS_PER_FEED = 5
const MAX_ITEMS = 20

const gn = (query: string) =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`

export const AI_NEWS_FEEDS: ServerFeed[] = [
  { name: 'AI News', url: gn('(OpenAI OR Anthropic OR Google AI OR "large language model" OR ChatGPT) when:2d') },
  { name: 'VentureBeat AI', url: 'https://venturebeat.com/category/ai/feed/' },
  { name: 'The Verge AI', url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml' },
  { name: 'MIT Tech Review AI', url: 'https://www.technologyreview.com/topic/artificial-intelligence/feed' },
  { name: 'ArXiv AI', url: 'https://export.arxiv.org/rss/cs.AI' },
]

function hashString(input: string): string {
  let hash = 2166136261
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(Number(num)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, num) => String.fromCharCode(parseInt(num, 16)))
}

function extractTag(block: string, tag: string): string {
  const cdataRegex = new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*<\\/${tag}>`, 'i')
  const plainRegex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i')

  const cdata = block.match(cdataRegex)
  if (cdata?.[1]) return cdata[1].trim()

  const plain = block.match(plainRegex)
  if (!plain?.[1]) return ''

  return decodeXmlEntities(plain[1].replace(/<[^>]+>/g, '').trim())
}

function parsePublishedAt(block: string, isAtom: boolean): number {
  const raw = isAtom
    ? extractTag(block, 'published') || extractTag(block, 'updated')
    : extractTag(block, 'pubDate')

  if (!raw) return Date.now()

  const parsed = new Date(raw).getTime()
  return Number.isNaN(parsed) ? Date.now() : parsed
}

export function parseFeedXml(xml: string, feedName: string): ParsedFeedItem[] {
  const itemRegex = /<item[\s\S]*?>[\s\S]*?<\/item>/gi
  const entryRegex = /<entry[\s\S]*?>[\s\S]*?<\/entry>/gi

  let blocks = [...xml.match(itemRegex)]
  let isAtom = false

  if (blocks.length === 0) {
    blocks = [...xml.match(entryRegex)]
    isAtom = true
  }

  const parsed: ParsedFeedItem[] = []

  for (const rawBlock of blocks.slice(0, ITEMS_PER_FEED)) {
    const block = rawBlock.toString()
    const title = extractTag(block, 'title')
    if (!title) continue

    let link = ''
    if (isAtom) {
      const hrefMatch = block.match(/<link[^>]+href=["']([^"']+)["']/i)
      link = hrefMatch?.[1]?.trim() ?? ''
    } else {
      link = extractTag(block, 'link')
    }

    const publishedAt = parsePublishedAt(block, isAtom)
    const idBase = link || title

    parsed.push({
      id: `news-${hashString(`${feedName}:${idBase}`)}`,
      source: feedName,
      title: title.replace(/\s+/g, ' ').trim(),
      link,
      publishedAt,
    })
  }

  return parsed
}

function toNewsItem(item: ParsedFeedItem): NewsItem {
  let category = 'AI News'
  if (item.source === 'ArXiv AI') category = 'Research'
  if (item.source.includes('VentureBeat') || item.source.includes('The Verge')) category = 'Industry'

  return {
    type: 'news',
    id: item.id,
    title: item.title,
    source: item.source,
    category,
    publishedAt: new Date(item.publishedAt).toISOString(),
    url: item.link || '#',
  }
}

function dedupeItems(items: ParsedFeedItem[]): ParsedFeedItem[] {
  const seen = new Set<string>()
  const unique: ParsedFeedItem[] = []

  for (const item of items) {
    const dedupeKey = `${item.title.toLowerCase()}|${item.link.toLowerCase()}`
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)
    unique.push(item)
  }

  return unique
}

async function fetchRssText(url: string, signal: AbortSignal): Promise<string | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS)
  const abortListener = () => controller.abort()
  signal.addEventListener('abort', abortListener, { once: true })

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/rss+xml, application/xml, text/xml, */*',
        'User-Agent': 'Stratum/0.2 (+https://github.com/koala73/worldmonitor-inspired)',
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

async function fetchFeed(feed: ServerFeed, signal: AbortSignal): Promise<ParsedFeedItem[]> {
  const result = await cachedFetchWithFallback<ParsedFeedItem[]>({
    key: `rss:feed:v1:${feed.url}`,
    ttlSeconds: 600,
    staleMaxAgeMs: 6 * 60 * 60 * 1_000,
    fetcher: async () => {
      const text = await fetchRssText(feed.url, signal)
      if (!text) return null

      const parsed = parseFeedXml(text, feed.name)
      return parsed.length > 0 ? parsed : null
    },
  })

  return result.data ?? []
}

export async function fetchAiNewsItems(): Promise<NewsItem[]> {
  const deadlineController = new AbortController()
  const deadlineTimeout = setTimeout(() => deadlineController.abort(), OVERALL_DEADLINE_MS)

  try {
    const allItems: ParsedFeedItem[] = []

    for (let i = 0; i < AI_NEWS_FEEDS.length; i += BATCH_CONCURRENCY) {
      if (deadlineController.signal.aborted) break

      const batch = AI_NEWS_FEEDS.slice(i, i + BATCH_CONCURRENCY)
      const settled = await Promise.allSettled(
        batch.map((feed) => fetchFeed(feed, deadlineController.signal)),
      )

      for (const result of settled) {
        if (result.status === 'fulfilled') {
          allItems.push(...result.value)
        }
      }
    }

    const deduped = dedupeItems(allItems)
    deduped.sort((a, b) => b.publishedAt - a.publishedAt)

    return deduped.slice(0, MAX_ITEMS).map(toNewsItem)
  } finally {
    clearTimeout(deadlineTimeout)
  }
}
