import type { SectionData } from '../../../../../lib/types.ts'
import { fetchUsNewsItems } from '../../../../../lib/data/us-news.ts'
import { cachedFetchWithFallback } from '../../../../../lib/server/cache.ts'
import { sectionJsonResponse } from '../../../../../lib/server/http-cache.ts'
import { persistIfFresh } from '../../../../../lib/server/persist-after-fetch.ts'

export const CACHE_TTL_SECONDS = 3_600

function emptySection(): SectionData {
  return { items: [], fetchedAt: new Date().toISOString() }
}

export async function GET(_req: Request) {
  try {
    const result = await cachedFetchWithFallback<SectionData>({
      key: 'stratum:global-news:news:us-news:v1',
      ttlSeconds: CACHE_TTL_SECONDS,
      staleMaxAgeMs: 12 * 60 * 60 * 1_000,
      fetcher: async () => {
        const items = await fetchUsNewsItems(20)
        if (items.length === 0) throw new Error('No US news items fetched')
        return { items, fetchedAt: new Date().toISOString() }
      },
    })

    persistIfFresh('global-news', 'news-us-news', result)
    return sectionJsonResponse(result.data ?? emptySection(), 'fast', result.source)
  } catch {
    return sectionJsonResponse(emptySection(), 'fast', 'none')
  }
}
