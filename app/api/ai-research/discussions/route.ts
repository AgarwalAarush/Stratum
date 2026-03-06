import type { SectionData } from '@/lib/types'
import { fetchDiscussions } from '@/lib/data/discussions'
import { cachedFetchWithFallback } from '@/lib/server/cache'
import { sectionJsonResponse } from '@/lib/server/http-cache'

const CACHE_KEY = 'stratum:ai-research:discussions:v1'

export async function GET() {
  try {
    const { data, source } = await cachedFetchWithFallback<SectionData>({
      key: CACHE_KEY,
      ttlSeconds: 300,
      staleMaxAgeMs: 6 * 60 * 60 * 1_000,
      fetcher: async () => {
        const items = await fetchDiscussions(20)
        return {
          items,
          fetchedAt: new Date().toISOString(),
        }
      },
    })

    return sectionJsonResponse(
      data ?? { items: [], fetchedAt: new Date().toISOString() },
      'fast',
      source,
    )
  } catch {
    return sectionJsonResponse(
      { items: [], fetchedAt: new Date().toISOString() },
      'fast',
      'none',
    )
  }
}
