import type { SectionData } from '../../../../../lib/types.ts'
import { fetchNewsItemsByTopic, type NewsTopic } from '../../../../../lib/data/rss.ts'
import { cachedFetchWithFallback } from '../../../../../lib/server/cache.ts'
import { sectionJsonResponse, type CacheTier } from '../../../../../lib/server/http-cache.ts'
import { persistIfFresh } from '../../../../../lib/server/persist-after-fetch.ts'

type GlobalNewsTopic =
  | 'geopolitics'
  | 'european-union'
  | 'climate-environment'
  | 'global-supply-chains'
  | 'global-summits'
  | 'global-health'

const GLOBAL_NEWS_TOPICS: GlobalNewsTopic[] = [
  'geopolitics',
  'european-union',
  'climate-environment',
  'global-supply-chains',
  'global-summits',
  'global-health',
]

function isGlobalNewsTopic(value: string): value is GlobalNewsTopic {
  return (GLOBAL_NEWS_TOPICS as string[]).includes(value)
}

export const CACHE_TTL_SECONDS: Record<GlobalNewsTopic, number> = {
  geopolitics: 3_600,
  'european-union': 3_600,
  'climate-environment': 3_600,
  'global-supply-chains': 3_600,
  'global-summits': 3_600,
  'global-health': 3_600,
}

const CACHE_TIER_BY_TOPIC: Record<GlobalNewsTopic, CacheTier> = {
  geopolitics: 'fast',
  'european-union': 'medium',
  'climate-environment': 'medium',
  'global-supply-chains': 'medium',
  'global-summits': 'slow',
  'global-health': 'medium',
}

function emptySection(): SectionData {
  return { items: [], fetchedAt: new Date().toISOString() }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ topic: string }> },
) {
  const { topic } = await params

  if (!isGlobalNewsTopic(topic)) {
    return sectionJsonResponse(emptySection(), 'medium', 'none')
  }

  const tier = CACHE_TIER_BY_TOPIC[topic]
  const ttlSeconds = CACHE_TTL_SECONDS[topic]

  try {
    const result = await cachedFetchWithFallback<SectionData>({
      key: `stratum:global-news:news:${topic}:v1`,
      ttlSeconds,
      staleMaxAgeMs: 12 * 60 * 60 * 1_000,
      fetcher: async () => {
        const items = await fetchNewsItemsByTopic(topic as NewsTopic, 20)
        if (items.length === 0) {
          throw new Error(`No items fetched for topic "${topic}"`)
        }

        return {
          items,
          fetchedAt: new Date().toISOString(),
        }
      },
    })

    persistIfFresh('global-news', `news-${topic}`, result)
    return sectionJsonResponse(result.data ?? emptySection(), tier, result.source)
  } catch {
    return sectionJsonResponse(emptySection(), tier, 'none')
  }
}
