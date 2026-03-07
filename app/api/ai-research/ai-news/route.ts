import type { SectionData } from '../../../../lib/types.ts'
import { fetchNewsItemsByTopic } from '../../../../lib/data/rss.ts'
import { cachedFetchWithFallback } from '../../../../lib/server/cache.ts'
import { sectionJsonResponse } from '../../../../lib/server/http-cache.ts'
import { persistIfFresh } from '../../../../lib/server/persist-after-fetch.ts'

const CACHE_KEY = 'stratum:ai-research:news:general:v1'
export const CACHE_TTL_SECONDS = 3_600

export async function GET() {
  try {
    const result = await cachedFetchWithFallback<SectionData>({
      key: CACHE_KEY,
      ttlSeconds: CACHE_TTL_SECONDS,
      staleMaxAgeMs: 12 * 60 * 60 * 1_000,
      fetcher: async () => {
        const items = await fetchNewsItemsByTopic('general', 20)
        if (items.length === 0) {
          throw new Error('No items fetched for general AI news')
        }

        return {
          items,
          fetchedAt: new Date().toISOString(),
        }
      },
    })

    persistIfFresh('ai-research', 'ai-news', result)
    return sectionJsonResponse(
      result.data ?? { items: [], fetchedAt: new Date().toISOString() },
      'medium',
      result.source,
    )
  } catch {
    return sectionJsonResponse(
      { items: [], fetchedAt: new Date().toISOString() },
      'medium',
      'none',
    )
  }
}
