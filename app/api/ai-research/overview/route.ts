import type { OverviewData } from '../../../../lib/types.ts'
import { generateAIOverview } from '../../../../lib/data/overview.ts'
import { cachedFetchWithFallback } from '../../../../lib/server/cache.ts'
import { sectionJsonResponse } from '../../../../lib/server/http-cache.ts'

const CACHE_KEY = 'stratum:ai-research:overview:v1'
const CACHE_TTL_SECONDS = 1_800 // 30 min

export async function GET() {
  try {
    const { data, source } = await cachedFetchWithFallback<OverviewData>({
      key: CACHE_KEY,
      ttlSeconds: CACHE_TTL_SECONDS,
      staleMaxAgeMs: 6 * 60 * 60 * 1_000,
      fetcher: async () => {
        const overview = await generateAIOverview()
        if (overview.bullets.length === 0) return null
        return overview
      },
    })

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
