import type { ArticleScraper, ScrapedArticle } from './types.ts'
import { arxivScraper } from './arxiv.ts'
import { githubScraper } from './github.ts'
import { genericScraper } from './generic.ts'
import { cachedFetchWithFallback } from '../../server/cache.ts'

const scrapers: ArticleScraper[] = [arxivScraper, githubScraper]

const domainMap = new Map<string, ArticleScraper>()
for (const scraper of scrapers) {
  for (const domain of scraper.domains) {
    domainMap.set(domain, scraper)
  }
}

const GOOGLE_NEWS_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

// Semaphore to limit concurrent Google News resolution requests
class Semaphore {
  private queue: (() => void)[] = []
  private active = 0
  private max: number
  constructor(max: number) { this.max = max }
  async acquire(): Promise<void> {
    if (this.active < this.max) {
      this.active++
      return
    }
    return new Promise<void>((resolve) => {
      this.queue.push(() => { this.active++; resolve() })
    })
  }
  release(): void {
    this.active--
    const next = this.queue.shift()
    if (next) next()
  }
}

const gnewsSemaphore = new Semaphore(4)

async function decodeGoogleNewsUrl(url: string): Promise<string | null> {
  await gnewsSemaphore.acquire()
  try {
    // Extract article ID from path (after /articles/ or /read/)
    const match = url.match(/\/(?:articles|read)\/(CB[A-Za-z0-9_-]+)/)
    if (!match) return null
    const articleId = match[1]

    // Step 1: Fetch the Google News article page to get timestamp + signature
    const pageRes = await fetch(`https://news.google.com/articles/${articleId}`, {
      signal: AbortSignal.timeout(10_000),
      headers: { 'User-Agent': GOOGLE_NEWS_UA },
    })
    if (pageRes.status === 429) {
      console.warn('[gnews] Rate limited on article page fetch')
      return null
    }
    const html = await pageRes.text()

    const tsMatch = html.match(/data-n-a-ts="([^"]+)"/)
    const sgMatch = html.match(/data-n-a-sg="([^"]+)"/)
    if (!tsMatch || !sgMatch) return null
    const timestamp = tsMatch[1]
    const signature = sgMatch[1]

    // Step 2: POST to batchexecute RPC to get the real URL
    const payload = [
      [
        [
          'Fbv4je',
          JSON.stringify([
            'garturlreq',
            [
              ['X', 'X', ['X', 'X'], null, null, 1, 1, 'US:en', null, 1, null, null, null, null, null, 0, 1],
              'X',
              'X',
              1,
              [1, 1, 1],
              1,
              1,
              null,
              0,
              0,
              null,
              0,
            ],
            articleId,
            Number(timestamp),
            signature,
          ]),
          null,
          'generic',
        ],
      ],
    ]

    const body = `f.req=${encodeURIComponent(JSON.stringify(payload))}`
    const rpcRes = await fetch('https://news.google.com/_/DotsSplashUi/data/batchexecute', {
      method: 'POST',
      signal: AbortSignal.timeout(10_000),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'User-Agent': GOOGLE_NEWS_UA,
        'Referer': 'https://news.google.com/',
        'X-Same-Domain': '1',
      },
      body,
    })
    if (rpcRes.status === 429) {
      console.warn('[gnews] Rate limited on batchexecute RPC')
      return null
    }
    const rpcText = await rpcRes.text()

    // Response format: first line is length prefix, then blank line, then JSON array
    const chunks = rpcText.split('\n\n')
    if (chunks.length < 2) return null
    const outer = JSON.parse(chunks[1])
    if (!outer[0][2]) return null
    const inner = JSON.parse(outer[0][2])
    const decoded = inner[1]
    if (typeof decoded === 'string' && decoded.startsWith('http')) return decoded

    return null
  } catch {
    return null
  } finally {
    gnewsSemaphore.release()
  }
}

export async function cachedDecodeGoogleNewsUrl(url: string): Promise<string | null> {
  const match = url.match(/\/(?:articles|read)\/(CB[A-Za-z0-9_-]+)/)
  if (!match) return null

  const articleId = match[1]
  const result = await cachedFetchWithFallback<string>({
    key: `stratum:gnews:url:v1:${articleId}`,
    ttlSeconds: 86400,
    negativeTtlSeconds: 3600,
    fetcher: () => decodeGoogleNewsUrl(url),
  })

  return result.data ?? null
}

async function resolveUrl(url: string): Promise<string | null> {
  const hostname = new URL(url).hostname
  if (!hostname.includes('news.google.com')) return url
  return cachedDecodeGoogleNewsUrl(url)
}

export async function scrapeArticle(url: string): Promise<ScrapedArticle | null> {
  try {
    const resolved = await resolveUrl(url)
    if (!resolved) return null
    const hostname = new URL(resolved).hostname.replace(/^www\./, '')
    const scraper = domainMap.get(hostname) ?? genericScraper
    return await scraper.scrape(resolved)
  } catch {
    return null
  }
}
