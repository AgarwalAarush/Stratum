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

async function resolveUrl(url: string): Promise<string> {
  const hostname = new URL(url).hostname
  if (!hostname.includes('news.google.com')) return url
  const controller = new AbortController()
  const res = await fetch(url, {
    redirect: 'follow',
    signal: controller.signal,
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Stratum/0.1)' },
  })
  controller.abort() // don't need the body
  return res.url
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
