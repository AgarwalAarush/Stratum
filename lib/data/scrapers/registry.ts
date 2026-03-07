import type { ArticleScraper, ScrapedArticle } from './types'
import { arxivScraper } from './arxiv'
import { githubScraper } from './github'
import { genericScraper } from './generic'

const scrapers: ArticleScraper[] = [arxivScraper, githubScraper]

const domainMap = new Map<string, ArticleScraper>()
for (const scraper of scrapers) {
  for (const domain of scraper.domains) {
    domainMap.set(domain, scraper)
  }
}

const GOOGLE_NEWS_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

async function decodeGoogleNewsUrl(url: string): Promise<string> {
  try {
    // Extract article ID from path (after /articles/ or /read/)
    const match = url.match(/\/(?:articles|read)\/(CB[A-Za-z0-9_-]+)/)
    if (!match) return url
    const articleId = match[1]

    // Step 1: Fetch the Google News article page to get timestamp + signature
    const pageRes = await fetch(`https://news.google.com/articles/${articleId}`, {
      signal: AbortSignal.timeout(10_000),
      headers: { 'User-Agent': GOOGLE_NEWS_UA },
    })
    const html = await pageRes.text()

    const tsMatch = html.match(/data-n-a-ts="([^"]+)"/)
    const sgMatch = html.match(/data-n-a-sg="([^"]+)"/)
    if (!tsMatch || !sgMatch) return url
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
    const rpcText = await rpcRes.text()

    // Response format: first line is length prefix, then blank line, then JSON array
    const chunks = rpcText.split('\n\n')
    if (chunks.length < 2) return url
    const outer = JSON.parse(chunks[1])
    if (!outer[0][2]) return url
    const inner = JSON.parse(outer[0][2])
    const decoded = inner[1]
    if (typeof decoded === 'string' && decoded.startsWith('http')) return decoded

    return url
  } catch {
    return url
  }
}

async function resolveUrl(url: string): Promise<string> {
  const hostname = new URL(url).hostname
  if (!hostname.includes('news.google.com')) return url
  return decodeGoogleNewsUrl(url)
}

export async function scrapeArticle(url: string): Promise<ScrapedArticle | null> {
  try {
    const resolved = await resolveUrl(url)
    const hostname = new URL(resolved).hostname.replace(/^www\./, '')
    const scraper = domainMap.get(hostname) ?? genericScraper
    return await scraper.scrape(resolved)
  } catch {
    return null
  }
}
