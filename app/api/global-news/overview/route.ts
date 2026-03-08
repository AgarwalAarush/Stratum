import type { OverviewData } from '../../../../lib/types.ts'
import { generateGlobalNewsOverview } from '../../../../lib/data/global-news-overview.ts'
import { saveGlobalNewsDailyOverview } from '../../../../lib/data/overview-persistence.ts'
import { cachedFetchWithFallback } from '../../../../lib/server/cache.ts'
import { sectionJsonResponse } from '../../../../lib/server/http-cache.ts'

const CACHE_KEY = 'stratum:global-news:overview:v1'
const CACHE_TTL_SECONDS = 21_600 // 6 hours

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const force = searchParams.get('force') === 'true'

  if (force) {
    try {
      const overview = await generateGlobalNewsOverview()
      if (overview.bullets.length > 0) {
        void saveGlobalNewsDailyOverview(overview.bullets)
      }
      return sectionJsonResponse(overview, 'slow', 'fresh')
    } catch {
      return sectionJsonResponse(
        { bullets: [], fetchedAt: new Date().toISOString() },
        'slow',
        'none',
      )
    }
  }

  try {
    const { data, source } = await cachedFetchWithFallback<OverviewData>({
      key: CACHE_KEY,
      ttlSeconds: CACHE_TTL_SECONDS,
      staleMaxAgeMs: 24 * 60 * 60 * 1_000,
      fetcher: async () => {
        const overview = await generateGlobalNewsOverview()
        if (overview.bullets.length === 0) return null
        return overview
      },
    })

    if (source === 'fresh' && data && data.bullets.length > 0) {
      void saveGlobalNewsDailyOverview(data.bullets)
    }

    return sectionJsonResponse(
      data ?? { bullets: [], fetchedAt: new Date().toISOString() },
      'slow',
      source,
    )
  } catch {
    return sectionJsonResponse(
      { bullets: [], fetchedAt: new Date().toISOString() },
      'slow',
      'none',
    )
  }
}
