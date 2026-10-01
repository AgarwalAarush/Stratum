import type { OverviewData } from '../types.ts'
import { synthesizeDailyIntelligence, type DailyIntelligenceOptions } from './daily-intelligence.ts'
import { fetchNewsItemsByTopic } from './rss.ts'
import { fetchArxivPapers } from './arxiv.ts'
import { fetchTrendingRepos } from './repos.ts'
import { fetchDiscussions } from './discussions.ts'

interface SourceItem {
  title: string
  url: string
  publishedAt?: string
}

const SECTIONS: Array<{ label: string; fetch: () => Promise<SourceItem[]> }> = [
  {
    label: 'GENERAL AI',
    fetch: async () => {
      const items = await fetchNewsItemsByTopic('general', 5)
      return items.map((i) => ({ ...i, title: i.title, url: i.url }))
    },
  },
  {
    label: 'POLICY',
    fetch: async () => {
      const items = await fetchNewsItemsByTopic('policy', 5)
      return items.map((i) => ({ ...i, title: i.title, url: i.url }))
    },
  },
  {
    label: 'CYBERSECURITY',
    fetch: async () => {
      const items = await fetchNewsItemsByTopic('cybersecurity', 5)
      return items.map((i) => ({ ...i, title: i.title, url: i.url }))
    },
  },
  {
    label: 'VENTURE CAPITAL',
    fetch: async () => {
      const items = await fetchNewsItemsByTopic('venture-capital', 5)
      return items.map((i) => ({ ...i, title: i.title, url: i.url }))
    },
  },
  {
    label: 'TECH EVENTS',
    fetch: async () => {
      const items = await fetchNewsItemsByTopic('tech-events', 5)
      return items.map((i) => ({ ...i, title: i.title, url: i.url }))
    },
  },
  {
    label: 'INFRA & HARDWARE',
    fetch: async () => {
      const items = await fetchNewsItemsByTopic('infra-hardware', 5)
      return items.map((i) => ({ ...i, title: i.title, url: i.url }))
    },
  },
  {
    label: 'NEW TECHNOLOGY',
    fetch: async () => {
      const items = await fetchNewsItemsByTopic('new-technology', 5)
      return items.map((i) => ({ ...i, title: i.title, url: i.url }))
    },
  },
  {
    label: 'STARTUPS',
    fetch: async () => {
      const items = await fetchNewsItemsByTopic('startups', 5)
      return items.map((i) => ({ ...i, title: i.title, url: i.url }))
    },
  },
  {
    label: 'PAPERS',
    fetch: async () => {
      const items = await fetchArxivPapers(5)
      return items.map((i) => ({ ...i, title: i.title, url: i.url }))
    },
  },
  {
    label: 'REPOS',
    fetch: async () => {
      const items = await fetchTrendingRepos(5)
      if (!items) return []
      return items.map((i) => ({ title: `${i.owner}/${i.name}: ${i.description}`, url: i.url }))
    },
  },
  {
    label: 'DISCUSSIONS',
    fetch: async () => {
      const items = await fetchDiscussions(5)
      return items.map((i) => ({ ...i, title: i.title, url: i.url }))
    },
  },
]

export async function generateAIOverview(options: DailyIntelligenceOptions = {}): Promise<OverviewData> {
  return synthesizeDailyIntelligence(SECTIONS, 'AI, technology and research', options)
}
