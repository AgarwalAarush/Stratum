// app/api/ai-research/papers/route.ts
import type { SectionData } from '@/lib/types'
import { fetchAlphaxivPapers } from '@/lib/data/alphaxiv'
import { fetchArxivPapers } from '@/lib/data/arxiv'
import { cachedFetchWithFallback } from '@/lib/server/cache'
import { sectionJsonResponse } from '@/lib/server/http-cache'
import { persistIfFresh } from '@/lib/server/persist-after-fetch'

const CACHE_KEY = 'stratum:ai-research:papers:v3'
export const CACHE_TTL_SECONDS = 86_400

export async function GET() {
  try {
    const result = await cachedFetchWithFallback<SectionData>({
      key: CACHE_KEY,
      ttlSeconds: CACHE_TTL_SECONDS,
      staleMaxAgeMs: 24 * 60 * 60 * 1_000,
      fetcher: async () => {
        let items = await fetchAlphaxivPapers(20)
        if (items.length === 0) items = await fetchArxivPapers(20)
        if (items.length === 0) return null

        return {
          items,
          fetchedAt: new Date().toISOString(),
        }
      },
    })

    persistIfFresh('ai-research', 'papers', result)
    return sectionJsonResponse(
      result.data ?? { items: [], fetchedAt: new Date().toISOString() },
      'static',
      result.source,
    )
  } catch {
    return sectionJsonResponse(
      { items: [], fetchedAt: new Date().toISOString() },
      'static',
      'none',
    )
  }
}
