import type { NewsItem } from '../types.ts'
import { fetchNewsItemsByTopic, toNewsItem } from './rss.ts'
import { scrapeApNews, scrapeWsj } from './scrapers/news-listing.ts'

export async function fetchUsNewsItems(limit = 20): Promise<NewsItem[]> {
  const [rssItems, apItems, wsjItems] = await Promise.allSettled([
    fetchNewsItemsByTopic('us-news', limit),
    scrapeApNews(5),
    scrapeWsj(5),
  ])

  const items: NewsItem[] = []

  if (rssItems.status === 'fulfilled') {
    items.push(...rssItems.value)
  }

  const scraped = [
    ...(apItems.status === 'fulfilled' ? apItems.value : []),
    ...(wsjItems.status === 'fulfilled' ? wsjItems.value : []),
  ]

  for (const parsed of scraped) {
    items.push(toNewsItem(parsed, 'us-news'))
  }

  const seen = new Set<string>()
  const deduped: NewsItem[] = []
  for (const item of items) {
    const key = `${item.title.toLowerCase()}|${item.url}`
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(item)
  }

  deduped.sort((a, b) => (b.publishedAt > a.publishedAt ? 1 : b.publishedAt < a.publishedAt ? -1 : 0))
  return deduped.slice(0, limit)
}
