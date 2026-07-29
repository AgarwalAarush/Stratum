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

export function rankMarketEvents(items: NewsItem[], relevantSymbols: Iterable<string>): NewsItem[] {
  const relevant = new Set([...relevantSymbols].map((symbol) => symbol.toUpperCase()))
  const relevance = (item: NewsItem) => {
    const topicSymbol = item.topic?.startsWith('company:') ? item.topic.slice(8).toUpperCase() : ''
    if (relevant.has(topicSymbol)) return 3
    const searchable = `${item.title} ${item.category ?? ''}`.toUpperCase()
    if ([...relevant].some((symbol) => new RegExp(`(^|\\W)${symbol.replace('.', '\\.')}($|\\W)`).test(searchable))) return 2
    if ((item.category ?? '').toLowerCase().includes('sec') || (item.category ?? '').toLowerCase().includes('earn')) return 1
    return 0
  }
  return [...items].sort((left, right) =>
    relevance(right) - relevance(left)
    || Date.parse(right.publishedAt) - Date.parse(left.publishedAt))
}
