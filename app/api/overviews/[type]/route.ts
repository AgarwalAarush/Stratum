import type { PeriodicOverviewData } from '../../../../lib/types'
import { fetchLatestOverview } from '../../../../lib/data/overview-persistence'
import { generateWeeklyOverview, generateMonthlyOverview } from '../../../../lib/data/overview-generators'
import { cachedFetchWithFallback } from '../../../../lib/server/cache'
import { sectionJsonResponse } from '../../../../lib/server/http-cache'

const TTL: Record<string, number> = {
  weekly: 6 * 60 * 60,   // 6 hours
  monthly: 24 * 60 * 60, // 24 hours
}

const emptyResponse = (type: string) => ({
  type, content: '', date: '', periodStart: '', periodEnd: '', fetchedAt: new Date().toISOString(),
})

export async function GET(
  request: Request,
  { params }: { params: Promise<{ type: string }> },
) {
  const { type } = await params

  if (type !== 'weekly' && type !== 'monthly') {
    return sectionJsonResponse({ error: 'Invalid type' }, 'fast', 'none')
  }

  const { searchParams } = new URL(request.url)
  const force = searchParams.get('force') === 'true'

  if (force) {
    try {
      const result = type === 'weekly'
        ? await generateWeeklyOverview()
        : await generateMonthlyOverview()

      if (!result.success || !result.content) {
        return sectionJsonResponse(emptyResponse(type), type === 'weekly' ? 'medium' : 'slow', 'none')
      }

      // Fetch the saved overview to get full metadata
      const overview = await fetchLatestOverview(type)
      if (!overview) {
        return sectionJsonResponse(emptyResponse(type), type === 'weekly' ? 'medium' : 'slow', 'none')
      }

      return sectionJsonResponse(
        {
          type,
          content: overview.content,
          date: overview.date,
          periodStart: overview.periodStart,
          periodEnd: overview.periodEnd,
          fetchedAt: new Date().toISOString(),
        } as PeriodicOverviewData,
        type === 'weekly' ? 'medium' : 'slow',
        'fresh',
      )
    } catch {
      return sectionJsonResponse(emptyResponse(type), type === 'weekly' ? 'medium' : 'slow', 'none')
    }
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
      data ?? emptyResponse(type),
      type === 'weekly' ? 'medium' : 'slow',
      source,
    )
  } catch {
    return sectionJsonResponse(
      emptyResponse(type),
      type === 'weekly' ? 'medium' : 'slow',
      'none',
    )
  }
}
