import type { NewsItem } from '../types.ts'
import { getSupabaseClient } from '../server/supabase.ts'
import { fetchFmpStableJson, type FmpRequestOptions } from '../server/fmp.ts'
import { persistFeedItems, type FeedItemRow } from './overview-persistence.ts'
import { hashString } from './rss-parser.ts'
import { safeIso } from './finance-rss.ts'

export const FMP_MARKET_SECTIONS = [
  'fmp-stock-news',
  'fmp-press-releases',
  'fmp-sec-filings',
] as const

export type FmpMarketSection = typeof FMP_MARKET_SECTIONS[number]

interface FmpNewsRow {
  symbol?: string
  publishedDate?: string
  date?: string
  publisher?: string
  site?: string
  title?: string
  url?: string
}

interface FmpSecFilingRow {
  symbol?: string
  cik?: string
  filingDate?: string
  acceptedDate?: string
  formType?: string
  link?: string
  finalLink?: string
}

interface FmpSourceDefinition {
  section: FmpMarketSection
  endpoint: string
  parameters: Record<string, string | number>
  normalize: (payload: unknown) => NewsItem[]
}

function dedupeNewsItems(items: NewsItem[]): NewsItem[] {
  return [...new Map(items.map((item) => [`${item.type}:${item.url}`, item])).values()]
}

export interface FmpIntelligenceSectionResult {
  section: FmpMarketSection
  itemCount: number
  items: NewsItem[]
  error?: string
}

export interface FmpIntelligenceBatch {
  provider: 'fmp'
  dataAsOf: string
  itemCount: number
  sections: FmpIntelligenceSectionResult[]
}

interface FmpIntelligenceOptions {
  apiKey?: string
  fetchImpl?: typeof fetch
  now?: Date
  lookbackDays?: number
  limitPerSource?: number
}

function normalizeSymbol(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const symbol = value.trim().toUpperCase()
  return /^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol) ? symbol : undefined
}

export function normalizeFmpNewsRows(payload: unknown, category: 'Stock News' | 'Press Release'): NewsItem[] {
  if (!Array.isArray(payload)) return []

  return payload.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []
    const row = entry as FmpNewsRow
    const title = row.title?.trim()
    const url = row.url?.trim()
    const publishedAt = safeIso(row.publishedDate ?? row.date ?? '')
    if (!title || !url || !publishedAt) return []

    const symbol = normalizeSymbol(row.symbol)
    const source = row.publisher?.trim() || row.site?.trim() || 'Financial Modeling Prep'

    return [{
      type: 'news' as const,
      id: `news-${hashString(`fmp:${category}:${url}`)}`,
      title,
      source,
      feedName: 'Financial Modeling Prep',
      canonicalSource: source,
      topic: symbol ? `company:${symbol}` : 'markets',
      category: symbol ? `${category} · ${symbol}` : category,
      publishedAt,
      url,
    }]
  })
}

export function normalizeFmpSecFilingRows(payload: unknown): NewsItem[] {
  if (!Array.isArray(payload)) return []

  return payload.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []
    const row = entry as FmpSecFilingRow
    const url = row.finalLink?.trim() || row.link?.trim()
    const publishedAt = safeIso(row.acceptedDate ?? row.filingDate ?? '')
    if (!url || !publishedAt) return []

    const symbol = normalizeSymbol(row.symbol)
    const issuer = symbol ?? row.cik?.trim() ?? 'Issuer'
    const formType = row.formType?.trim() || 'SEC filing'

    return [{
      type: 'news' as const,
      id: `news-${hashString(`fmp:sec:${url}`)}`,
      title: `${issuer} filed ${formType}`,
      source: 'SEC EDGAR via FMP',
      feedName: 'Financial Modeling Prep',
      canonicalSource: 'sec.gov',
      topic: symbol ? `company:${symbol}` : 'sec-filings',
      category: `SEC ${formType}`,
      publishedAt,
      url,
    }]
  })
}

function sourceDefinitions(now: Date, lookbackDays: number, limit: number): FmpSourceDefinition[] {
  const from = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1_000).toISOString().slice(0, 10)
  const to = now.toISOString().slice(0, 10)

  return [
    {
      section: 'fmp-stock-news',
      endpoint: 'news/stock-latest',
      parameters: { page: 0, limit },
      normalize: (payload) => normalizeFmpNewsRows(payload, 'Stock News'),
    },
    {
      section: 'fmp-press-releases',
      endpoint: 'news/press-releases-latest',
      parameters: { page: 0, limit },
      normalize: (payload) => normalizeFmpNewsRows(payload, 'Press Release'),
    },
    {
      section: 'fmp-sec-filings',
      endpoint: 'sec-filings-financials',
      parameters: { from, to, page: 0, limit },
      normalize: normalizeFmpSecFilingRows,
    },
  ]
}

export async function fetchFmpMarketIntelligence(options: FmpIntelligenceOptions = {}): Promise<FmpIntelligenceBatch> {
  const apiKey = options.apiKey ?? process.env.FMP_API_KEY
  if (!apiKey) throw new Error('FMP credentials are not configured')

  const now = options.now ?? new Date()
  const requestOptions: FmpRequestOptions = { apiKey, fetchImpl: options.fetchImpl }
  const definitions = sourceDefinitions(now, options.lookbackDays ?? 7, options.limitPerSource ?? 100)

  const settled = await Promise.allSettled(definitions.map(async (definition) => {
    const payload = await fetchFmpStableJson<unknown>(definition.endpoint, definition.parameters, requestOptions)
    return dedupeNewsItems(definition.normalize(payload))
  }))

  const sections = settled.map<FmpIntelligenceSectionResult>((result, index) => {
    const definition = definitions[index]
    if (result.status === 'fulfilled') {
      return { section: definition.section, itemCount: result.value.length, items: result.value }
    }
    return {
      section: definition.section,
      itemCount: 0,
      items: [],
      error: result.reason instanceof Error ? result.reason.message : String(result.reason),
    }
  })

  if (sections.every((section) => section.error)) {
    throw new Error(`All FMP intelligence sources failed: ${sections.map((section) => section.error).join('; ')}`)
  }

  return {
    provider: 'fmp',
    dataAsOf: now.toISOString(),
    itemCount: sections.reduce((sum, section) => sum + section.itemCount, 0),
    sections,
  }
}

export async function syncFmpMarketIntelligence(options: FmpIntelligenceOptions = {}): Promise<Omit<FmpIntelligenceBatch, 'sections'> & {
  sources: Record<FmpMarketSection, { itemCount: number; error?: string }>
}> {
  const batch = await fetchFmpMarketIntelligence(options)

  await Promise.all(batch.sections.map(async (section) => {
    if (section.items.length > 0) {
      await persistFeedItems('markets', section.section, section.items, { strict: true })
    }
  }))

  return {
    provider: batch.provider,
    dataAsOf: batch.dataAsOf,
    itemCount: batch.itemCount,
    sources: Object.fromEntries(batch.sections.map((section) => [
      section.section,
      { itemCount: section.itemCount, ...(section.error ? { error: section.error } : {}) },
    ])) as Record<FmpMarketSection, { itemCount: number; error?: string }>,
  }
}

function persistedRowToNewsItem(row: FeedItemRow): NewsItem | null {
  if (!row.url || !row.title || !row.published_at) return null
  const metadata = row.metadata ?? {}

  return {
    type: 'news',
    id: typeof metadata.id === 'string' ? metadata.id : `news-${hashString(`persisted-fmp:${row.url}`)}`,
    title: row.title,
    source: typeof metadata.source === 'string' ? metadata.source : 'Financial Modeling Prep',
    feedName: 'Financial Modeling Prep',
    canonicalSource: typeof metadata.canonicalSource === 'string' ? metadata.canonicalSource : undefined,
    topic: typeof metadata.topic === 'string' ? metadata.topic : undefined,
    category: typeof metadata.category === 'string' ? metadata.category : 'Markets',
    publishedAt: row.published_at,
    url: row.url,
  }
}

export async function fetchPersistedFmpMarketItems(
  sections: readonly FmpMarketSection[] = FMP_MARKET_SECTIONS,
  limit = 40,
): Promise<NewsItem[]> {
  const supabase = getSupabaseClient()
  if (!supabase) return []

  const { data, error } = await supabase
    .from('feed_items')
    .select('*')
    .eq('scope', 'markets')
    .in('section', [...sections])
    .order('published_at', { ascending: false })
    .limit(limit)

  if (error || !data) return []

  return (data as FeedItemRow[])
    .map(persistedRowToNewsItem)
    .filter((item): item is NewsItem => item !== null)
}
