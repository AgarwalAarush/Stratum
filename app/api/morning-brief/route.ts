import type { MorningBriefData } from '../../../lib/types'
import { generateMorningBrief } from '../../../lib/data/morning-brief'
import { fetchLatestMorningBrief } from '../../../lib/data/overview-persistence'
import { cachedFetchWithFallback } from '../../../lib/server/cache'
import { sectionJsonResponse } from '../../../lib/server/http-cache'

export const CACHE_TTL_SECONDS = 21_600

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const force = searchParams.get('force') === 'true'

  if (force) {
    try {
      const brief = await generateMorningBrief()
      return sectionJsonResponse(brief, 'slow', 'fresh')
    } catch {
      return sectionJsonResponse(emptyResponse(), 'slow', 'none')
    }
  }

  try {
    const { data, source } = await cachedFetchWithFallback<MorningBriefData>({
      key: 'stratum:morning-brief:v1',
      ttlSeconds: CACHE_TTL_SECONDS,
      fetcher: async () => {
        return await fetchLatestMorningBrief()
      },
    })

    return sectionJsonResponse(data ?? emptyResponse(), 'slow', source)
  } catch {
    return sectionJsonResponse(emptyResponse(), 'slow', 'none')
  }
}

function emptyResponse(): MorningBriefData {
  return {
    headline: '',
    sections: [],
    watchList: [],
    itemCount: 0,
    generatedAt: '',
    fetchedAt: new Date().toISOString(),
  }
}
