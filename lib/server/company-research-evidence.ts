import { collectFinanceFeedItems, financeGoogleNewsRss } from '../data/finance-rss.ts'
import { cachedDecodeGoogleNewsUrl, scrapeArticle } from '../data/scrapers/registry.ts'
import type { ParsedFeedItem } from '../data/rss-parser.ts'
import type {
  CompanyResearchEvidence,
  CompanyResearchEvidenceKind,
  CompanyResearchEvidenceQuality,
} from '../markets/types.ts'

const MAX_RESEARCH_EVIDENCE = 24
const MAX_SCRAPED_ARTICLES = 16

export interface CompanyResearchEvidenceOptions {
  context?: CompanyResearchContext
  collect?: (feeds: Array<{ name: string; url: string }>) => Promise<ParsedFeedItem[]>
  resolveGoogleNewsUrl?: (url: string) => Promise<string | null>
  scrape?: (url: string) => Promise<{ title: string; content: string; url: string } | null>
  now?: Date
}

export interface CompanyResearchContext {
  sector?: string | null
  subIndustry?: string | null
  description?: string | null
  brand?: string | null
  leader?: string | null
}

function normalizedCompanyName(companyName: string, symbol: string): string {
  const normalized = companyName
    .replace(/\b(incorporated|inc\.?|corp\.?|corporation|ltd\.?|limited|plc|pbc|class [a-z])\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
  return normalized || symbol
}

export function companyResearchQueries(
  companyName: string,
  symbol: string,
  context: CompanyResearchContext = {},
): string[] {
  const company = normalizedCompanyName(companyName, symbol)
  const searchName = context.brand?.trim() || company
  const market = [context.sector, context.subIndustry].filter(Boolean).join(' ')
  const marketContext = market ? ` ${market}` : ''
  const leaderContext = context.leader?.trim() ? ` "${context.leader.trim()}"` : ''
  return [
    `"${searchName}" ${symbol} products customers adoption business model`,
    `"${searchName}" ${symbol} growth contracts backlog pricing unit economics`,
    `"${searchName}" ${symbol} capacity deployment technology product roadmap`,
    `"${searchName}" ${symbol}${marketContext} market demand competition substitutes TAM`,
    `"${searchName}" ${symbol}${marketContext} policy regulation macro supply chain environment`,
    `"${searchName}" ${symbol} strategic relationship ecosystem platform`,
    `"${searchName}" ${symbol}${leaderContext} affiliates related party acquisitions merger`,
    `"${searchName}" ${symbol}${leaderContext} shared infrastructure customers suppliers partnerships`,
  ]
}

function websiteBrand(companyWebsite: string | null): string | null {
  if (!companyWebsite) return null
  try {
    const host = new URL(companyWebsite).hostname.replace(/^www\./, '')
    return host.split('.')[0]?.trim() || null
  } catch {
    return null
  }
}

function relevantToCompany(
  item: ParsedFeedItem,
  companyName: string,
  symbol: string,
  brand: string | null,
): boolean {
  const title = item.title.toLowerCase()
  const aliases = [normalizedCompanyName(companyName, symbol), brand]
    .filter((value): value is string => Boolean(value?.trim()))
    .map((value) => value.toLowerCase())
  if (aliases.some((alias) => title.includes(alias))) return true
  return new RegExp(`\\b${symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(item.title)
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
  if (/\b(acquisition|acquires|partnership|partner|ecosystem|joint venture|related party|affiliate|subsidiary)\b/.test(haystack)) {
    return 'strategic_relationship'
  }
  if (/\b(ai|artificial intelligence|machine learning|generative|foundation model|large language)\b/.test(haystack)) {
    return 'ai_and_product'
  }
  if (/\b(regulation|regulatory|policy|tariff|rate|interest rate|inflation|recession|macro|demand cycle|supply chain|interconnection|spectrum|procurement)\b/.test(haystack)) {
    return 'market_environment'
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
  if (/\b(product|service|platform|deployment|subscriber|user|workflow|customer adoption)\b/.test(haystack)) {
    return 'product_and_customer'
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

function diversifyByResearchLane(items: ParsedFeedItem[]): ParsedFeedItem[] {
  const sorted = [...items].sort((left, right) => right.publishedAt - left.publishedAt)
  const selected: ParsedFeedItem[] = []
  const usedLanes = new Set<string>()
  for (const item of sorted) {
    if (usedLanes.has(item.source)) continue
    usedLanes.add(item.source)
    selected.push(item)
  }
  for (const item of sorted) {
    if (selected.length >= MAX_RESEARCH_EVIDENCE) break
    if (!selected.includes(item)) selected.push(item)
  }
  return selected.slice(0, MAX_RESEARCH_EVIDENCE)
}

/**
 * Collects a bounded but broad company-specific research pack on the worker.
 * The eight lanes deliberately cover product/customer value, commercial proof,
 * technology/capacity, market structure, macro/policy environment, strategic
 * relationships, related parties, and shared infrastructure. The cap protects
 * worker latency and packet size; it is not a claim that a headline count is
 * sufficient diligence. Search results are
 * source material, never facts by themselves: the report prompt requires
 * attribution and distinguishes primary/regulatory evidence from independent
 * reporting and unresolved discovery links.
 */
export async function collectCompanyResearchEvidence(
  companyName: string,
  symbol: string,
  companyWebsite: string | null,
  options: CompanyResearchEvidenceOptions = {},
): Promise<CompanyResearchEvidence[]> {
  const context = options.context ?? {}
  const brand = context.brand?.trim() || websiteBrand(companyWebsite)
  const collect = options.collect ?? (async (feeds) => collectFinanceFeedItems(feeds, {
    limit: 60,
    overallDeadlineMs: 45_000,
    feedTimeoutMs: 12_000,
    batchConcurrency: 3,
  }))
  const resolveGoogleNewsUrl = options.resolveGoogleNewsUrl ?? cachedDecodeGoogleNewsUrl
  const scrape = options.scrape ?? scrapeArticle
  const feeds = companyResearchQueries(companyName, symbol, { ...context, brand }).map((query, index) => ({
    name: `Company research ${index + 1}`,
    url: financeGoogleNewsRss(query),
  }))
  const deduped = dedupe(await collect(feeds))
  const relevant = deduped.filter((item) => relevantToCompany(item, companyName, symbol, brand))
  const discovered = diversifyByResearchLane(relevant.length >= 4 ? relevant : deduped)

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
