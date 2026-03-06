// app/api/ai-research/papers/route.ts
import type { SectionData } from '@/lib/types'
import { fetchArxivPapers } from '@/lib/data/arxiv'
import { cachedFetchWithFallback } from '@/lib/server/cache'
import { sectionJsonResponse } from '@/lib/server/http-cache'

const CACHE_KEY = 'stratum:ai-research:papers:v2'
export const CACHE_TTL_SECONDS = 86_400

export async function GET() {
  try {
    const { data, source } = await cachedFetchWithFallback<SectionData>({
      key: CACHE_KEY,
      ttlSeconds: CACHE_TTL_SECONDS,
      staleMaxAgeMs: 24 * 60 * 60 * 1_000,
      fetcher: async () => {
        const items = await fetchArxivPapers(20)
        if (items.length === 0) return null

        return {
          items,
          fetchedAt: new Date().toISOString(),
        }
      },
    })

    return sectionJsonResponse(
      data ?? { items: [], fetchedAt: new Date().toISOString() },
      'static',
      source,
    )
  } catch {
    return sectionJsonResponse(
      { items: [], fetchedAt: new Date().toISOString() },
      'static',
      'none',
    )
  }
}
