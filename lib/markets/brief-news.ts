import type { NewsItem } from '../types.ts'

const LEGAL_SOLICITATION = /class action|investor alert|encourages .* investors|law firm|shareholder (alert|update)|securities litigation/i
const ROUTINE_FILING = /\bfiled (10-[kq]|8-k|form [0-9a-z-]+)\b/i
const COMMENTARY_NOT_SIGNAL = /factcheck|cherry-picked|\bboast\b|\bopinion\b|\bexplainer\b|\bshould test\b/i

function isRelevantToSymbols(item: NewsItem, symbols: Set<string>): boolean {
  const topicSymbol = item.topic?.startsWith('company:') ? item.topic.slice(8).toUpperCase() : ''
  if (symbols.has(topicSymbol)) return true

  const searchable = `${item.title} ${item.category ?? ''}`.toUpperCase()
  return [...symbols].some((symbol) => new RegExp(`(^|\\W)${symbol.replace('.', '\\.')}($|\\W)`).test(searchable))
}

function newsPriority(item: NewsItem, symbols: Set<string>): number {
  const category = (item.category ?? '').toLowerCase()
  const source = `${item.source} ${item.canonicalSource ?? ''}`.toLowerCase()
  let score = isRelevantToSymbols(item, symbols) ? 12 : 0

  if (/(rates|inflation|labor|macro)/.test(category)) score += 7
  if (/(earnings|merger|m&a|ipo|acquisition|deal)/.test(category)) score += 5
  if (/(reuters|associated press|ap news|wall street journal|financial times)/.test(source)) score += 3
  if (/research/.test(category)) score += 1
  return score
}

/**
 * Keeps the overview's news rail useful: it is a small, source-linked set of
 * fresh market context rather than the full events stream or a generic news
 * feed. The function is deliberately deterministic; it does not assign a
 * causal explanation to an article.
 */
export function selectMarketBriefNews(
  items: NewsItem[],
  relevantSymbols: Iterable<string> = [],
  limit = 5,
): NewsItem[] {
  const symbols = new Set([...relevantSymbols].map((symbol) => symbol.toUpperCase()).filter(Boolean))
  const seen = new Set<string>()

  return [...items]
    .filter((item) => !LEGAL_SOLICITATION.test(item.title))
    .filter((item) => !COMMENTARY_NOT_SIGNAL.test(item.title))
    .filter((item) => !ROUTINE_FILING.test(item.title) || isRelevantToSymbols(item, symbols))
    .sort((left, right) =>
      newsPriority(right, symbols) - newsPriority(left, symbols)
      || Date.parse(right.publishedAt) - Date.parse(left.publishedAt)
      || left.title.localeCompare(right.title))
    .filter((item) => {
      const key = item.url || item.title.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, limit)
}
