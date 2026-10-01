import type { MorningBriefData } from '../../../lib/types.ts'
import { fetchLatestMorningBrief } from '../../../lib/data/overview-persistence.ts'
import { cachedFetchWithFallback } from '../../../lib/server/cache.ts'
import { sectionJsonResponse } from '../../../lib/server/http-cache.ts'

export const CACHE_TTL_SECONDS = 21_600

export async function GET() {
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
    readiness: 'blocked', errors: ['No accepted morning brief is available'], dataAsOf: null, sourceCoverage: [], sources: [],
    headline: '',
    sections: [],
    watchList: [],
    itemCount: 0,
    generatedAt: '',
    fetchedAt: new Date().toISOString(),
  }
}
