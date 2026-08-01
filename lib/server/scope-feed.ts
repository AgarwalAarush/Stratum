import { getScopeById } from '../scopes.ts'
import type { OverviewData, SectionData } from '../types.ts'
import { GET as aiOverview } from '../../app/api/ai-research/overview/route.ts'
import { GET as aiDiscussions } from '../../app/api/ai-research/discussions/route.ts'
import { GET as aiPapers } from '../../app/api/ai-research/papers/route.ts'
import { GET as aiRepos } from '../../app/api/ai-research/repos/route.ts'
import { GET as aiNews } from '../../app/api/ai-research/news/[topic]/route.ts'
import { GET as globalOverview } from '../../app/api/global-news/overview/route.ts'
import { GET as globalNews } from '../../app/api/global-news/news/[topic]/route.ts'
import { GET as financeDeals } from '../../app/api/finance/deals/route.ts'
import { GET as financeEarnings } from '../../app/api/finance/earnings/route.ts'
import { GET as financeReports } from '../../app/api/finance/reports/route.ts'
import { GET as macroIndicators } from '../../app/api/macro/indicators/route.ts'

export interface ScopeFeedPayload {
  sections: Record<string, SectionData>
  overview: OverviewData | null
}

function emptySection(): SectionData {
  return { items: [], fetchedAt: new Date().toISOString() }
}

async function readSection(response: Promise<Response>): Promise<SectionData> {
  try {
    const result = await response
    const data = await result.json() as SectionData
    return result.ok && Array.isArray(data.items) && typeof data.fetchedAt === 'string' ? data : emptySection()
  } catch {
    return emptySection()
  }
}

async function readOverview(response: Promise<Response>): Promise<OverviewData | null> {
  try {
    const result = await response
    const data = await result.json() as OverviewData
    return result.ok && Array.isArray(data.bullets) && typeof data.fetchedAt === 'string' ? data : null
  } catch {
    return null
  }
}

function topicRequest(topic: string) {
  return new Request(`https://stratum.local/api/topic/${topic}`)
}

async function sectionResponse(scopeId: string, sectionId: string): Promise<Response> {
  if (scopeId === 'ai-research') {
    if (sectionId === 'discussions') return aiDiscussions()
    if (sectionId === 'papers') return aiPapers()
    if (sectionId === 'repos') return aiRepos()
    const topic = sectionId === 'ai-news-general'
      ? 'general'
      : sectionId === 'ai-policy-regulation'
        ? 'policy'
        : sectionId.replace('ai-news-', '')
    return aiNews(topicRequest(topic), { params: Promise.resolve({ topic }) })
  }
  if (scopeId === 'global-news') {
    const topic = sectionId
    return globalNews(topicRequest(topic), { params: Promise.resolve({ topic }) })
  }
  if (sectionId === 'earnings') return financeEarnings()
  if (sectionId === 'deals') return financeDeals()
  if (sectionId === 'research-reports') return financeReports()
  return macroIndicators()
}

export async function fetchScopeFeedPayload(scopeId: string): Promise<ScopeFeedPayload | null> {
  const scope = getScopeById(scopeId)
  if (!scope) return null

  const sectionEntriesPromise = Promise.all(scope.sections.map(async (section) => [
    section.id,
    await readSection(sectionResponse(scope.id, section.id)),
  ] as const))
  const overviewPromise: Promise<OverviewData | null> = scope.id === 'ai-research'
    ? readOverview(aiOverview(topicRequest('ai-research-overview')))
    : scope.id === 'global-news'
      ? readOverview(globalOverview(topicRequest('global-news-overview')))
      : Promise.resolve(null)
  const [sectionEntries, overview] = await Promise.all([sectionEntriesPromise, overviewPromise])
  return { sections: Object.fromEntries(sectionEntries), overview }
}
