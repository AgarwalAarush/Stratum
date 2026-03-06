import type { PeriodicOverviewData } from '../../../../lib/types'
import { fetchLatestOverview } from '../../../../lib/data/overview-persistence'
import { cachedFetchWithFallback } from '../../../../lib/server/cache'
import { sectionJsonResponse } from '../../../../lib/server/http-cache'

const TTL: Record<string, number> = {
  weekly: 6 * 60 * 60,   // 6 hours
  monthly: 24 * 60 * 60, // 24 hours
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ type: string }> },
) {
  const { type } = await params

  if (type !== 'weekly' && type !== 'monthly') {
    return sectionJsonResponse({ error: 'Invalid type' }, 'fast', 'none')
  }

  const cacheKey = `stratum:overviews:${type}:v1`
  const ttlSeconds = TTL[type]

  try {
    const { data, source } = await cachedFetchWithFallback<PeriodicOverviewData>({
      key: cacheKey,
      ttlSeconds,
      fetcher: async () => {
        const overview = await fetchLatestOverview(type)
        if (!overview) return null
        return {
          type,
          content: overview.content,
          date: overview.date,
          periodStart: overview.periodStart,
          periodEnd: overview.periodEnd,
          fetchedAt: new Date().toISOString(),
        }
      },
    })

    return sectionJsonResponse(
      data ?? { type, content: '', date: '', periodStart: '', periodEnd: '', fetchedAt: new Date().toISOString() },
      type === 'weekly' ? 'medium' : 'slow',
      source,
    )
  } catch {
    return sectionJsonResponse(
      { type, content: '', date: '', periodStart: '', periodEnd: '', fetchedAt: new Date().toISOString() },
      type === 'weekly' ? 'medium' : 'slow',
      'none',
    )
  }
}
