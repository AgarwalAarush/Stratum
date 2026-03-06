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

export async function scrapeArticle(url: string): Promise<ScrapedArticle | null> {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '')
    const scraper = domainMap.get(hostname) ?? genericScraper
    return await scraper.scrape(url)
  } catch {
    return null
  }
}
