import type { SectionData } from '../../../../lib/types.ts'
import { fetchFinanceEarnings } from '../../../../lib/data/finance-earnings.ts'
import { cachedFetchWithFallback } from '../../../../lib/server/cache.ts'
import { sectionJsonResponse } from '../../../../lib/server/http-cache.ts'
import { persistIfFresh } from '../../../../lib/server/persist-after-fetch.ts'

const CACHE_KEY = 'stratum:finance:earnings:v1'
export const CACHE_TTL_SECONDS = 3_600

function emptySection(): SectionData {
  return { items: [], fetchedAt: new Date().toISOString() }
}

export async function GET() {
  try {
    const result = await cachedFetchWithFallback<SectionData>({
      key: CACHE_KEY,
      ttlSeconds: CACHE_TTL_SECONDS,
      staleMaxAgeMs: 12 * 60 * 60 * 1_000,
      fetcher: async () => {
        const items = await fetchFinanceEarnings(60, { calendarStyle: false })
        if (items.length === 0) {
          throw new Error('No finance earnings items fetched')
        }

        return {
          items,
          fetchedAt: new Date().toISOString(),
        }
      },
    })

    persistIfFresh('finance', 'earnings', result)
    return sectionJsonResponse(result.data ?? emptySection(), 'fast', result.source)
  } catch {
    return sectionJsonResponse(emptySection(), 'fast', 'none')
  }
}
