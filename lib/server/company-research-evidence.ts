import { collectFinanceFeedItems, financeGoogleNewsRss } from '../data/finance-rss.ts'
import { cachedDecodeGoogleNewsUrl, scrapeArticle } from '../data/scrapers/registry.ts'
import type { ParsedFeedItem } from '../data/rss-parser.ts'
import type {
  CompanyResearchEvidence,
  CompanyResearchEvidenceKind,
  CompanyResearchEvidenceQuality,
} from '../markets/types.ts'

const MAX_RESEARCH_EVIDENCE = 12
const MAX_SCRAPED_ARTICLES = 8

export interface CompanyResearchEvidenceOptions {
  collect?: (feeds: Array<{ name: string; url: string }>) => Promise<ParsedFeedItem[]>
  resolveGoogleNewsUrl?: (url: string) => Promise<string | null>
  scrape?: (url: string) => Promise<{ title: string; content: string; url: string } | null>
  now?: Date
}

function normalizedCompanyName(companyName: string, symbol: string): string {
  const normalized = companyName
    .replace(/\b(incorporated|inc\.?|corp\.?|corporation|ltd\.?|limited|plc|pbc|class [a-z])\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
  return normalized || symbol
}

export function companyResearchQueries(companyName: string, symbol: string): string[] {
  const company = normalizedCompanyName(companyName, symbol)
  return [
    `"${company}" ${symbol} growth contracts backlog`,
    `"${company}" ${symbol} AI product partnership`,
    `"${company}" ${symbol} market competition TAM`,
    `"${company}" ${symbol} data platform moat strategy`,
  ]
}

function sourceName(item: ParsedFeedItem, url: string): string {
  if (item.publisher?.trim()) return item.publisher.trim()
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return item.source
  }
}

function evidenceQuality(url: string, companyWebsite: string | null): CompanyResearchEvidenceQuality {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '')
    if (host === 'sec.gov' || host.endsWith('.sec.gov')) return 'regulatory'
    if (companyWebsite) {
      const companyHost = new URL(companyWebsite).hostname.replace(/^www\./, '')
      if (host === companyHost || host.endsWith(`.${companyHost}`)) return 'primary'
    }
    if (host === 'news.google.com') return 'discovery'
  } catch {
    return 'discovery'
  }
  return 'independent'
}

function evidenceKind(title: string, excerpt: string): CompanyResearchEvidenceKind {
  const haystack = `${title} ${excerpt}`.toLowerCase()
  if (/\b(ai|artificial intelligence|machine learning|generative|foundation model|large language)\b/.test(haystack)) {
    return 'ai_and_product'
  }
  if (/\b(competitor|competition|market share|tam|total addressable|industry)\b/.test(haystack)) {
    return 'market_and_competition'
  }
  if (/\b(moat|switching cost|data archive|network effect|intellectual property|barrier)\b/.test(haystack)) {
    return 'moat'
  }
  if (/\b(growth|contract|backlog|guidance|launch|revenue|customer)\b/.test(haystack)) {
    return 'growth_driver'
  }
  return 'company_strategy'
}

function compactExcerpt(value: string | null | undefined): string | null {
  const normalized = value?.replace(/\s+/g, ' ').trim() ?? ''
  if (!normalized) return null
  return normalized.slice(0, 1_400)
}

function dedupe(items: ParsedFeedItem[]): ParsedFeedItem[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = `${item.title.toLowerCase()}|${item.link.toLowerCase()}`
    if (seen.has(key)) return false
    seen.add(key)
    return Boolean(item.title && item.link)
  })
}

/**
 * Collects a bounded, company-specific research pack on the worker. Search
 * results are source material, never facts by themselves: the report prompt
 * requires attribution and distinguishes primary/regulatory evidence from
 * independent reporting and unresolved discovery links.
 */
export async function collectCompanyResearchEvidence(
  companyName: string,
  symbol: string,
  companyWebsite: string | null,
  options: CompanyResearchEvidenceOptions = {},
): Promise<CompanyResearchEvidence[]> {
  const collect = options.collect ?? (async (feeds) => collectFinanceFeedItems(feeds, {
    limit: 24,
    overallDeadlineMs: 30_000,
    feedTimeoutMs: 9_000,
    batchConcurrency: 3,
  }))
  const resolveGoogleNewsUrl = options.resolveGoogleNewsUrl ?? cachedDecodeGoogleNewsUrl
  const scrape = options.scrape ?? scrapeArticle
  const feeds = companyResearchQueries(companyName, symbol).map((query, index) => ({
    name: `Company research ${index + 1}`,
    url: financeGoogleNewsRss(query),
  }))
  const discovered = dedupe(await collect(feeds))
    .sort((left, right) => right.publishedAt - left.publishedAt)
    .slice(0, MAX_RESEARCH_EVIDENCE)

  const resolved = await Promise.all(discovered.map(async (item) => {
    try {
      const url = item.link.includes('news.google.com')
        ? await resolveGoogleNewsUrl(item.link) ?? item.link
        : item.link
      return { item, url }
    } catch {
      return { item, url: item.link }
    }
  }))
  const scraped = await Promise.allSettled(resolved.slice(0, MAX_SCRAPED_ARTICLES).map(async ({ url }) =>
    [url, await scrape(url)] as const,
  ))
  const scrapedByUrl = new Map(scraped.flatMap((result) =>
    result.status === 'fulfilled' ? [result.value] : []))

  return resolved.map(({ item, url }, index) => {
    const article = scrapedByUrl.get(url)
    const excerpt = compactExcerpt(article?.content)
    return {
      id: `research-web-${index + 1}`,
      kind: evidenceKind(item.title, excerpt ?? ''),
      title: article?.title?.trim() || item.title.trim(),
      url,
      source: sourceName(item, url),
      publishedAt: new Date(item.publishedAt || options.now?.getTime() || Date.now()).toISOString(),
      excerpt,
      quality: evidenceQuality(url, companyWebsite),
    }
  })
}
