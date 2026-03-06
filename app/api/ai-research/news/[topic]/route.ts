import type { SectionData } from '../../../../../lib/types.ts'
import { fetchNewsItemsByTopic, isNewsTopic, type NewsTopic } from '../../../../../lib/data/rss.ts'
import { cachedFetchWithFallback } from '../../../../../lib/server/cache.ts'
import { sectionJsonResponse, type CacheTier } from '../../../../../lib/server/http-cache.ts'

const CACHE_TTL_SECONDS: Record<NewsTopic, number> = {
  cybersecurity: 300,
  general: 600,
  'venture-capital': 600,
  'new-technology': 600,
  startups: 600,
  policy: 1_800,
  'infra-hardware': 1_800,
  'tech-events': 1_800,
}

const CACHE_TIER_BY_TOPIC: Record<NewsTopic, CacheTier> = {
  cybersecurity: 'fast',
  general: 'medium',
  'venture-capital': 'medium',
  'new-technology': 'medium',
  startups: 'medium',
  policy: 'slow',
  'infra-hardware': 'slow',
  'tech-events': 'slow',
}

function emptySection(): SectionData {
  return { items: [], fetchedAt: new Date().toISOString() }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ topic: string }> },
) {
  const { topic } = await params

  if (!isNewsTopic(topic)) {
    return sectionJsonResponse(emptySection(), 'medium', 'none')
  }

  const tier = CACHE_TIER_BY_TOPIC[topic]
  const ttlSeconds = CACHE_TTL_SECONDS[topic]

  try {
    const { data, source } = await cachedFetchWithFallback<SectionData>({
      key: `stratum:ai-research:news:${topic}:v1`,
      ttlSeconds,
      staleMaxAgeMs: 12 * 60 * 60 * 1_000,
      fetcher: async () => {
        const items = await fetchNewsItemsByTopic(topic, 20)
        if (items.length === 0) {
          throw new Error(`No items fetched for topic "${topic}"`)
        }

        return {
          items,
          fetchedAt: new Date().toISOString(),
        }
      },
    })

    return sectionJsonResponse(data ?? emptySection(), tier, source)
  } catch {
    return sectionJsonResponse(emptySection(), tier, 'none')
  }
}
