import type { NewsItem } from '../types.ts'

export function mergeMarketNews(groups: NewsItem[][], limit = 30): NewsItem[] {
  const seen = new Set<string>()
  return groups
    .flat()
    .sort((left, right) => Date.parse(right.publishedAt) - Date.parse(left.publishedAt))
    .filter((item) => {
      const key = `${item.title.toLowerCase().replace(/\W+/g, ' ').trim()}|${item.url}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, limit)
}
