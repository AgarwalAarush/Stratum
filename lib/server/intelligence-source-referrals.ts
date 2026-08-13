import { isKnownMarketDomain } from '../markets/domain-packs.ts'
import type { WorldSourceReferral } from '../markets/types.ts'
import { getSupabaseClient } from './supabase.ts'

type RecordValue = Record<string, unknown>

interface FeedItemRow {
  id: string
  scope: string
  section: string
  title: string
  url: string
  published_at: string | null
  metadata: unknown
}

export interface IntelligenceSourceReferralCandidate {
  feedItemId: string
  domainId: string
  feedScope: string
  feedSection: string
  title: string
  sourceUrl: string
  originUrl: string
  publisher: string | null
  publishedAt: string | null
  reason: string
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const UNSAFE_OR_DISCOVERY_PORTALS = new Set([
  'news.google.com', 'www.google.com', 'google.com', 'techmeme.com', 'www.techmeme.com',
  'news.ycombinator.com', 'www.reddit.com', 'reddit.com', 'x.com', 'twitter.com',
])

const DOMAIN_RULES: Array<{ domainId: string; terms: string[] }> = [
  { domainId: 'ai-power', terms: ['data center', 'datacenter', 'electricity', 'power grid', 'grid capacity', 'interconnection', 'transformer', 'utility load', 'generation capacity', 'power demand'] },
  { domainId: 'semicap-data-center-equipment', terms: ['semiconductor', 'semicap', 'chipmaker', 'foundry', 'wafer', 'hbm', 'memory chip', 'gpu', 'ai accelerator', 'data-center equipment', 'data center equipment', 'lithography'] },
  { domainId: 'critical-materials', terms: ['critical mineral', 'rare earth', 'lithium', 'copper', 'nickel', 'graphite', 'mining', 'mineral processing', 'export control'] },
  { domainId: 'macro-policy-geopolitics', terms: ['inflation', 'interest rate', 'central bank', 'fiscal policy', 'tariff', 'sanction', 'geopolit', 'trade policy', 'export control', 'industrial policy', 'gdp', 'unemployment'] },
  { domainId: 'industrial-automation', terms: ['industrial automation', 'robotics', 'robotic', 'factory automation', 'machine vision', 'industrial software', 'warehouse automation', 'plc'] },
  { domainId: 'defense-industrial-capacity', terms: ['defense', 'military', 'munitions', 'aerospace', 'procurement', 'pentagon', 'navy', 'army', 'air force', 'weapon system'] },
]

function record(value: unknown): RecordValue {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {}
}

function metadataString(metadata: RecordValue, key: string): string | null {
  const value = metadata[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function directHttpsUrl(value: string): URL | null {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || !url.hostname || UNSAFE_OR_DISCOVERY_PORTALS.has(url.hostname.toLowerCase())) return null
    return url
  } catch {
    return null
  }
}

/** A transparent keyword classifier for discovery only. The resulting referral
 * is neither market evidence nor a source candidate, and cannot affect a
 * thesis until it has passed the existing source-contract review flow. */
export function inferIntelligenceReferralDomains(input: { title: string; scope: string; section: string; metadata?: unknown }): Array<{ domainId: string; terms: string[] }> {
  const metadata = record(input.metadata)
  const searchable = [
    input.title, input.scope, input.section,
    metadataString(metadata, 'topic') ?? '', metadataString(metadata, 'category') ?? '',
  ].join(' ').toLowerCase()
  return DOMAIN_RULES.flatMap(({ domainId, terms }) => {
    if (!isKnownMarketDomain(domainId)) return []
    const matched = terms.filter((term) => searchable.includes(term))
    return matched.length ? [{ domainId, terms: matched.slice(0, 3) }] : []
  })
}

export function buildIntelligenceSourceReferralCandidates(rows: readonly FeedItemRow[]): IntelligenceSourceReferralCandidate[] {
  const candidates: IntelligenceSourceReferralCandidate[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    if (!UUID.test(row.id) || !['ai-research', 'global-news', 'markets'].includes(row.scope)) continue
    const source = directHttpsUrl(row.url)
    if (!source || !row.title.trim()) continue
    const metadata = record(row.metadata)
    const publisher = metadataString(metadata, 'publisher') ?? metadataString(metadata, 'source') ?? metadataString(metadata, 'canonicalSource') ?? metadataString(metadata, 'feedName')
    for (const match of inferIntelligenceReferralDomains(row)) {
      const key = `${row.id}:${match.domainId}`
      if (seen.has(key)) continue
      seen.add(key)
      candidates.push({
        feedItemId: row.id,
        domainId: match.domainId,
        feedScope: row.scope,
        feedSection: row.section,
        title: row.title.trim().slice(0, 1_000),
        sourceUrl: source.toString(),
        originUrl: source.origin,
        publisher: publisher?.slice(0, 500) ?? null,
        publishedAt: row.published_at,
        reason: `Matched ${match.terms.map((term) => `“${term}”`).join(', ')} in existing ${row.scope} / ${row.section} feed content. This is a discovery referral only.`,
      })
    }
  }
  return candidates
}

export async function materializeIntelligenceSourceReferrals(options: { lookbackDays?: number; limit?: number } = {}): Promise<{ scanned: number; matched: number; created: number }> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const lookbackDays = Math.max(1, Math.min(90, Math.round(options.lookbackDays ?? 30)))
  const limit = Math.max(50, Math.min(2_000, Math.round(options.limit ?? 800)))
  const cutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1_000).toISOString()
  const { data, error } = await supabase
    .from('feed_items')
    .select('id,scope,section,title,url,published_at,metadata')
    .in('scope', ['ai-research', 'global-news', 'markets'])
    .gte('published_at', cutoff)
    .order('published_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`Unable to scan Intelligence and Markets feeds: ${error.message}`)
  const candidates = buildIntelligenceSourceReferralCandidates((data ?? []) as FeedItemRow[])
  if (candidates.length === 0) return { scanned: (data ?? []).length, matched: 0, created: 0 }
  const { data: inserted, error: insertError } = await supabase
    .from('world_source_referrals')
    .upsert(candidates.map((candidate) => ({
      feed_item_id: candidate.feedItemId, domain_id: candidate.domainId, feed_scope: candidate.feedScope, feed_section: candidate.feedSection,
      title: candidate.title, source_url: candidate.sourceUrl, origin_url: candidate.originUrl, publisher: candidate.publisher,
      published_at: candidate.publishedAt, reason: candidate.reason,
    })), { onConflict: 'feed_item_id,domain_id', ignoreDuplicates: true })
    .select('id')
  if (insertError) throw new Error(`Unable to store source referrals: ${insertError.message}`)
  return { scanned: (data ?? []).length, matched: candidates.length, created: (inserted ?? []).length }
}

function normalizeReferral(row: RecordValue): WorldSourceReferral {
  const status = String(row.status)
  if (status !== 'pending' && status !== 'registered' && status !== 'dismissed') throw new Error('Invalid persisted source referral status')
  return {
    id: String(row.id), feedItemId: String(row.feed_item_id), domainId: String(row.domain_id), status,
    feedScope: String(row.feed_scope), feedSection: String(row.feed_section), title: String(row.title), sourceUrl: String(row.source_url),
    originUrl: String(row.origin_url), publisher: row.publisher === null ? null : String(row.publisher ?? ''),
    publishedAt: row.published_at === null ? null : String(row.published_at ?? ''), reason: String(row.reason),
    registeredSourceId: row.registered_source_id === null ? null : String(row.registered_source_id ?? ''),
    createdAt: String(row.created_at), updatedAt: String(row.updated_at),
  }
}

export async function fetchWorldSourceReferrals(limit = 120): Promise<WorldSourceReferral[]> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const { data, error } = await supabase.from('world_source_referrals').select('*').order('created_at', { ascending: false }).limit(Math.max(1, Math.min(limit, 300)))
  if (error) throw new Error(`Unable to load source referrals: ${error.message}`)
  return (data ?? []).map((row) => normalizeReferral(row as RecordValue))
}
