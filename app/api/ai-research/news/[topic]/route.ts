import type { SectionData } from '../../../../../lib/types.ts'
import { fetchNewsItemsByTopic } from '../../../../../lib/data/rss.ts'
import { cachedFetchWithFallback } from '../../../../../lib/server/cache.ts'
import { sectionJsonResponse, type CacheTier } from '../../../../../lib/server/http-cache.ts'
import { persistIfFresh } from '../../../../../lib/server/persist-after-fetch.ts'

type AiResearchNewsTopic =
  | 'general'
  | 'cybersecurity'
  | 'venture-capital'
  | 'policy'
  | 'new-technology'
  | 'startups'
  | 'infra-hardware'
  | 'tech-events'

const AI_RESEARCH_TOPICS: AiResearchNewsTopic[] = [
  'general', 'cybersecurity', 'venture-capital', 'policy',
  'new-technology', 'startups', 'infra-hardware', 'tech-events',
]

function isAiResearchNewsTopic(value: string): value is AiResearchNewsTopic {
  return (AI_RESEARCH_TOPICS as string[]).includes(value)
}

export const CACHE_TTL_SECONDS: Record<AiResearchNewsTopic, number> = {
  cybersecurity: 3_600,
  general: 3_600,
  'venture-capital': 3_600,
  'new-technology': 3_600,
  startups: 3_600,
  policy: 3_600,
  'infra-hardware': 3_600,
  'tech-events': 3_600,
}

const CACHE_TIER_BY_TOPIC: Record<AiResearchNewsTopic, CacheTier> = {
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

  if (!isAiResearchNewsTopic(topic)) {
    return sectionJsonResponse(emptySection(), 'medium', 'none')
  }

  const tier = CACHE_TIER_BY_TOPIC[topic]
  const ttlSeconds = CACHE_TTL_SECONDS[topic]

  try {
    const result = await cachedFetchWithFallback<SectionData>({
      key: `stratum:ai-research:news:${topic}:v2`,
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

    persistIfFresh('ai-research', `news-${topic}`, result)
    return sectionJsonResponse(result.data ?? emptySection(), tier, result.source)
  } catch {
    return sectionJsonResponse(emptySection(), tier, 'none')
  }
}
