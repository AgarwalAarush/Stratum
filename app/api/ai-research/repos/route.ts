import type { SectionData } from '@/lib/types'
import { fetchTrendingRepos } from '@/lib/data/repos'
import { cachedFetchWithFallback } from '@/lib/server/cache'
import { sectionJsonResponse } from '@/lib/server/http-cache'

const CACHE_KEY = 'stratum:ai-research:repos:v2'
export const CACHE_TTL_SECONDS = 3_600

export async function GET() {
  try {
    const { data, source } = await cachedFetchWithFallback<SectionData>({
      key: CACHE_KEY,
      ttlSeconds: CACHE_TTL_SECONDS,
      staleMaxAgeMs: 24 * 60 * 60 * 1_000,
      fetcher: async () => {
        const items = await fetchTrendingRepos(20)
        if (items === null) return null

        return {
          items,
          fetchedAt: new Date().toISOString(),
        }
      },
    })

    return sectionJsonResponse(
      data ?? { items: [], fetchedAt: new Date().toISOString() },
      'slow',
      source,
    )
  } catch {
    return sectionJsonResponse(
      { items: [], fetchedAt: new Date().toISOString() },
      'slow',
      'none',
    )
  }
}
