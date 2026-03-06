import type { SectionData } from '../../../../lib/types.ts'
import { fetchFinanceReports } from '../../../../lib/data/finance-reports.ts'
import { cachedFetchWithFallback } from '../../../../lib/server/cache.ts'
import { sectionJsonResponse } from '../../../../lib/server/http-cache.ts'

const CACHE_KEY = 'stratum:finance:reports:v1'

function emptySection(): SectionData {
  return { items: [], fetchedAt: new Date().toISOString() }
}

export async function GET() {
  try {
    const { data, source } = await cachedFetchWithFallback<SectionData>({
      key: CACHE_KEY,
      ttlSeconds: 1_800,
      staleMaxAgeMs: 24 * 60 * 60 * 1_000,
      fetcher: async () => {
        const items = await fetchFinanceReports(20)
        if (items.length === 0) {
          throw new Error('No finance reports items fetched')
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
