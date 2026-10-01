import type { OverviewData } from '../types.ts'
import { synthesizeDailyIntelligence, type DailyIntelligenceOptions } from './daily-intelligence.ts'
import { fetchNewsItemsByTopic } from './rss.ts'

interface SourceItem {
  title: string
  url: string
  publishedAt?: string
}

const SECTIONS: Array<{ label: string; fetch: () => Promise<SourceItem[]> }> = [
  {
    label: 'GEOPOLITICS',
    fetch: async () => {
      const items = await fetchNewsItemsByTopic('geopolitics', 5)
      return items.map((i) => ({ ...i, title: i.title, url: i.url }))
    },
  },
  {
    label: 'EUROPEAN UNION',
    fetch: async () => {
      const items = await fetchNewsItemsByTopic('european-union', 5)
      return items.map((i) => ({ ...i, title: i.title, url: i.url }))
    },
  },
  {
    label: 'CLIMATE & ENVIRONMENT',
    fetch: async () => {
      const items = await fetchNewsItemsByTopic('climate-environment', 5)
      return items.map((i) => ({ ...i, title: i.title, url: i.url }))
    },
  },
  {
    label: 'GLOBAL SUPPLY CHAINS',
    fetch: async () => {
      const items = await fetchNewsItemsByTopic('global-supply-chains', 5)
      return items.map((i) => ({ ...i, title: i.title, url: i.url }))
    },
  },
  {
    label: 'GLOBAL SUMMITS',
    fetch: async () => {
      const items = await fetchNewsItemsByTopic('global-summits', 5)
      return items.map((i) => ({ ...i, title: i.title, url: i.url }))
    },
  },
  {
    label: 'GLOBAL HEALTH',
    fetch: async () => {
      const items = await fetchNewsItemsByTopic('global-health', 5)
      return items.map((i) => ({ ...i, title: i.title, url: i.url }))
    },
  },
  {
    label: 'BIOTECH & CLINICAL CATALYSTS',
    fetch: async () => {
      const items = await fetchNewsItemsByTopic('biotech-clinical-regulatory', 5)
      return items.map((i) => ({ ...i, title: i.title, url: i.url }))
    },
  },
]

export async function generateGlobalNewsOverview(options: DailyIntelligenceOptions = {}): Promise<OverviewData> {
  return synthesizeDailyIntelligence(SECTIONS, 'global news', options)
}
