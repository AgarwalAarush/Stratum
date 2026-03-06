import type { SectionData } from '../../../../lib/types.ts'
import { fetchMacroIndicators } from '../../../../lib/data/finance-macro.ts'
import { cachedFetchWithFallback } from '../../../../lib/server/cache.ts'
import { sectionJsonResponse } from '../../../../lib/server/http-cache.ts'

const CACHE_KEY = 'stratum:finance:macro:v1'
export const CACHE_TTL_SECONDS = 3_600

function emptySection(): SectionData {
  return { items: [], fetchedAt: new Date().toISOString() }
}

export async function GET() {
  try {
    const { data, source } = await cachedFetchWithFallback<SectionData>({
      key: CACHE_KEY,
      ttlSeconds: CACHE_TTL_SECONDS,
      staleMaxAgeMs: 24 * 60 * 60 * 1_000,
      fetcher: async () => {
        const items = await fetchMacroIndicators(20)
        if (items.length === 0) {
          throw new Error('No macro indicator items fetched')
        }

        return {
          items,
          fetchedAt: new Date().toISOString(),
        }
      },
    })

    return sectionJsonResponse(data ?? emptySection(), 'slow', source)
  } catch {
    return sectionJsonResponse(emptySection(), 'slow', 'none')
  }
}
