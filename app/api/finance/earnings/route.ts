import type { SectionData } from '../../../../lib/types.ts'
import { fetchFinanceEarnings } from '../../../../lib/data/finance-earnings.ts'
import { cachedFetchWithFallback } from '../../../../lib/server/cache.ts'
import { sectionJsonResponse } from '../../../../lib/server/http-cache.ts'

const CACHE_KEY = 'stratum:finance:earnings:v1'

function emptySection(): SectionData {
  return { items: [], fetchedAt: new Date().toISOString() }
}

export async function GET() {
  try {
    const { data, source } = await cachedFetchWithFallback<SectionData>({
      key: CACHE_KEY,
      ttlSeconds: 300,
      staleMaxAgeMs: 12 * 60 * 60 * 1_000,
      fetcher: async () => {
        const items = await fetchFinanceEarnings(20, { calendarStyle: false })
        if (items.length === 0) {
          throw new Error('No finance earnings items fetched')
        }

        return {
          items,
          fetchedAt: new Date().toISOString(),
        }
      },
    })

    return sectionJsonResponse(data ?? emptySection(), 'fast', source)
  } catch {
    return sectionJsonResponse(emptySection(), 'fast', 'none')
  }
}
