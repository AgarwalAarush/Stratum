import type { EquityResearchNote } from '../markets/types.ts'
import { getSupabaseClient } from './supabase.ts'
import { cachedFetchWithFallback } from './cache.ts'
import { AsyncTtlCache } from './async-ttl-cache.ts'

export type ResearchLibraryEntry = Pick<EquityResearchNote, 'id' | 'symbol' | 'version' | 'status' | 'formalRating' | 'entryAction' | 'keyDebate' | 'generatedAt'>
const libraryCache = new AsyncTtlCache<ResearchLibraryEntry[]>()

async function fetchLibrary(ownerId: string, table: 'equity_research_notes' | 'etf_research_notes', limit: number): Promise<ResearchLibraryEntry[]> {
  const client = getSupabaseClient()
  if (!client) throw new Error('Research library unavailable')
  const { data, error } = await client.from(table)
    .select('id,symbol,version,status,formal_rating,entry_action,generated_at')
    .eq('owner_id', ownerId).order('generated_at', { ascending: false })
    .limit(Math.max(1, Math.min(100, limit))).abortSignal(AbortSignal.timeout(8_000))
  if (error) throw new Error('Research library unavailable')
  if (!data?.length) return []
  const debates = await client.from(table).select('id,key_debate:content->keyDebate')
    .eq('owner_id', ownerId).in('id', data.map(row => row.id)).abortSignal(AbortSignal.timeout(8_000))
  if (debates.error) throw new Error('Research library unavailable')
  const debateById = new Map((debates.data ?? []).map(row => [row.id, row.key_debate]))
  return (data ?? []).map(row => ({
    id: row.id, symbol: row.symbol, version: row.version, status: row.status,
    formalRating: row.formal_rating, entryAction: row.entry_action,
    generatedAt: row.generated_at, keyDebate: typeof debateById.get(row.id) === 'string' ? String(debateById.get(row.id)) : '',
  }))
}

export function fetchEquityResearchLibrary(ownerId: string, limit = 30) {
  return cachedLibrary(ownerId, 'equity_research_notes', limit)
}

export function fetchEtfResearchLibrary(ownerId: string, limit = 30) {
  return cachedLibrary(ownerId, 'etf_research_notes', limit)
}

async function cachedLibrary(ownerId: string, table: 'equity_research_notes' | 'etf_research_notes', limit: number) {
  const boundedLimit = Math.max(1, Math.min(100, limit))
  const key = `stratum:markets:research:library:${ownerId}:${table}:${boundedLimit}:v1`
  const entries = await libraryCache.get(key, 5_000, async () => (await cachedFetchWithFallback({
    key, ttlSeconds: 60, staleMaxAgeMs: 120_000,
    fetcher: () => fetchLibrary(ownerId, table, boundedLimit),
  })).data)
  return entries ?? []
}
