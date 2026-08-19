import { createHash } from 'node:crypto'
import { join } from 'node:path'
import type { WorldEventSourceInput } from './world-events.ts'
import { runCodexJson } from './codex-exec.ts'
import { selectMarketModel } from './market-model-policy.ts'
import { getSupabaseClient } from './supabase.ts'

interface GapSource { url: string; title: string; publisher: string; publishedAt: string; relevance: string }

function validateGapSearch(value: unknown): { sources: GapSource[] } {
  if (!value || typeof value !== 'object' || !Array.isArray((value as { sources?: unknown }).sources)) throw new Error('Historical gap search output is invalid')
  const sources = (value as { sources: unknown[] }).sources.map((entry) => {
    if (!entry || typeof entry !== 'object') throw new Error('Historical gap source is invalid')
    const row = entry as Record<string, unknown>
    if (![row.url, row.title, row.publisher, row.publishedAt, row.relevance].every((field) => typeof field === 'string' && field.trim())) throw new Error('Historical gap source fields are required')
    const parsed = new URL(String(row.url))
    if (parsed.protocol !== 'https:' || parsed.hostname === 'localhost' || parsed.hostname.endsWith('.local')) throw new Error('Historical gap source URL is unsafe')
    const publishedAt = new Date(String(row.publishedAt))
    if (!Number.isFinite(publishedAt.getTime())) throw new Error('Historical gap source date is invalid')
    return { url: parsed.toString(), title: String(row.title).trim().slice(0, 500), publisher: String(row.publisher).trim().slice(0, 200), publishedAt: publishedAt.toISOString(), relevance: String(row.relevance).trim().slice(0, 1_000) }
  }).slice(0, 25)
  return { sources }
}

export async function searchHistoricalWorldGap(options: { since: Date; until: Date; cwd: string }): Promise<WorldEventSourceInput[]> {
  const selection = selectMarketModel('world_web_research')
  const result = await runCodexJson({
    prompt: `Run one bounded historical gap search for material world developments published from ${options.since.toISOString()} through ${options.until.toISOString()}. Cover geopolitical and institutional change, climate and physical economy, macro/sovereign/credit stress, technology and industrial capacity, China-Taiwan, Iran, authoritarianism, ENSO, export controls, and AI power where relevant. Prefer official primary, high-quality global reporting, specialist, and research/data sources. Return at most 25 high-materiality exact HTTPS article/document URLs. Do not return search-result URLs, homepages, invented dates, company earnings recaps, stock-price commentary, or syndicated duplicates. The result is evidence discovery, not a world conclusion.`,
    schemaPath: join(process.cwd(), 'schemas/world-historical-gap.schema.json'), validate: validateGapSearch, model: selection.model, cwd: options.cwd, webSearch: true, timeoutMs: 12 * 60_000,
  })
  const sources = result.data.sources.filter((source) => Date.parse(source.publishedAt) >= options.since.getTime() - 24 * 60 * 60_000 && Date.parse(source.publishedAt) < options.until.getTime() + 24 * 60 * 60_000)
  const supabase = getSupabaseClient()
  if (!supabase || sources.length === 0) return []
  const rows = sources.map((source) => ({
    content_hash: createHash('sha256').update(`historical-gap:${source.url}`).digest('hex'), canonical_url: source.url, title: source.title,
    publisher: source.publisher, source_tier: 'discovery', mime_type: 'text/html', extraction_status: 'pending', published_at: source.publishedAt,
    metadata: { historicalGapSearch: true, relevance: source.relevance, searchWindow: { since: options.since.toISOString(), until: options.until.toISOString() }, model: result.metadata.model },
  }))
  // Evidence rows are append-only. A replay may rediscover the same URL in an
  // overlapping window, so conflict handling must be DO NOTHING rather than an
  // UPDATE that trips the immutable-document guard.
  const { error } = await supabase.from('world_documents').upsert(rows, { onConflict: 'content_hash', ignoreDuplicates: true })
  if (error) throw new Error(`Unable to persist historical gap sources: ${error.message}`)
  const hashes = rows.map((row) => row.content_hash)
  const { data, error: loadError } = await supabase.from('world_documents').select('id,content_hash,canonical_url,title,publisher,published_at,ingested_at,metadata').in('content_hash', hashes)
  if (loadError) throw new Error(`Unable to resolve historical gap sources: ${loadError.message}`)
  return (data ?? []).map((row) => ({ id: `document:${row.id}`, documentId: String(row.id), title: String(row.title), url: String(row.canonical_url), publisher: String(row.publisher), publishedAt: typeof row.published_at === 'string' ? row.published_at : null, fetchedAt: String(row.ingested_at), metadata: row.metadata as Record<string, unknown> }))
}
