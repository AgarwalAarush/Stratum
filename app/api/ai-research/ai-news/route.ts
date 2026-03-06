import type { SectionData } from '@/lib/types'
import { fetchAiNewsItems } from '@/lib/data/rss'
import { cachedFetchWithFallback } from '@/lib/server/cache'
import { sectionJsonResponse } from '@/lib/server/http-cache'

const CACHE_KEY = 'stratum:ai-research:ai-news:v1'

export async function GET() {
  try {
    const { data, source } = await cachedFetchWithFallback<SectionData>({
      key: CACHE_KEY,
      ttlSeconds: 600,
      staleMaxAgeMs: 12 * 60 * 60 * 1_000,
      fetcher: async () => {
        const items = await fetchAiNewsItems()
        return {
          items,
          fetchedAt: new Date().toISOString(),
        }
      },
    })

    return sectionJsonResponse(
      data ?? { items: [], fetchedAt: new Date().toISOString() },
      'medium',
      source,
    )
  } catch {
    return sectionJsonResponse(
      { items: [], fetchedAt: new Date().toISOString() },
      'medium',
      'none',
    )
  }
}
