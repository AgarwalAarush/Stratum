import type { SectionData } from '../../../../lib/types.ts'
import { fetchDiscussions } from '../../../../lib/data/discussions.ts'
import { cachedFetchWithFallback } from '../../../../lib/server/cache.ts'
import { sectionJsonResponse } from '../../../../lib/server/http-cache.ts'
import { persistIfFresh } from '../../../../lib/server/persist-after-fetch.ts'

const CACHE_KEY = 'stratum:ai-research:discussions:v1'
export const CACHE_TTL_SECONDS = 3_600

export async function GET() {
  try {
    const result = await cachedFetchWithFallback<SectionData>({
      key: CACHE_KEY,
      ttlSeconds: CACHE_TTL_SECONDS,
      staleMaxAgeMs: 6 * 60 * 60 * 1_000,
      fetcher: async () => {
        const items = await fetchDiscussions(20)
        return {
          items,
          fetchedAt: new Date().toISOString(),
        }
      },
    })

    persistIfFresh('ai-research', 'discussions', result)
    return sectionJsonResponse(
      result.data ?? { items: [], fetchedAt: new Date().toISOString() },
      'fast',
      result.source,
    )
  } catch {
    return sectionJsonResponse(
      { items: [], fetchedAt: new Date().toISOString() },
      'fast',
      'none',
    )
  }
}
