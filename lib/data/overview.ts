import Anthropic from '@anthropic-ai/sdk'
import type { OverviewData } from '../types'
import { fetchNewsItemsByTopic } from './rss'
import { fetchArxivPapers } from './arxiv'
import { fetchTrendingRepos } from './repos'
import { fetchDiscussions } from './discussions'

const SECTIONS: Array<{ label: string; fetch: () => Promise<string[]> }> = [
  {
    label: 'GENERAL AI',
    fetch: async () => {
      const items = await fetchNewsItemsByTopic('general', 5)
      return items.map((i) => i.title)
    },
  },
  {
    label: 'POLICY',
    fetch: async () => {
      const items = await fetchNewsItemsByTopic('policy', 5)
      return items.map((i) => i.title)
    },
  },
  {
    label: 'CYBERSECURITY',
    fetch: async () => {
      const items = await fetchNewsItemsByTopic('cybersecurity', 5)
      return items.map((i) => i.title)
    },
  },
  {
    label: 'VENTURE CAPITAL',
    fetch: async () => {
      const items = await fetchNewsItemsByTopic('venture-capital', 5)
      return items.map((i) => i.title)
    },
  },
  {
    label: 'TECH EVENTS',
    fetch: async () => {
      const items = await fetchNewsItemsByTopic('tech-events', 5)
      return items.map((i) => i.title)
    },
  },
  {
    label: 'INFRA & HARDWARE',
    fetch: async () => {
      const items = await fetchNewsItemsByTopic('infra-hardware', 5)
      return items.map((i) => i.title)
    },
  },
  {
    label: 'NEW TECHNOLOGY',
    fetch: async () => {
      const items = await fetchNewsItemsByTopic('new-technology', 5)
      return items.map((i) => i.title)
    },
  },
  {
    label: 'STARTUPS',
    fetch: async () => {
      const items = await fetchNewsItemsByTopic('startups', 5)
      return items.map((i) => i.title)
    },
  },
  {
    label: 'PAPERS',
    fetch: async () => {
      const items = await fetchArxivPapers(5)
      return items.map((i) => i.title)
    },
  },
  {
    label: 'REPOS',
    fetch: async () => {
      const items = await fetchTrendingRepos(5)
      if (!items) return []
      return items.map((i) => `${i.owner}/${i.name}: ${i.description}`)
    },
  },
  {
    label: 'DISCUSSIONS',
    fetch: async () => {
      const items = await fetchDiscussions(5)
      return items.map((i) => i.title)
    },
  },
]

const FALLBACK_BULLETS = [
  'AI development continues to accelerate across research, enterprise, and open-source communities.',
  'Policy makers are increasing scrutiny of large language models and AI safety frameworks.',
  'Infrastructure investments in AI chips and data centers remain at record levels.',
  'Venture capital activity in AI startups shows continued momentum despite market uncertainty.',
  'Open-source models are narrowing the gap with frontier proprietary systems.',
  'Cybersecurity threats increasingly leverage AI-generated content and automation.',
  'Academic research is pushing boundaries in multimodal understanding and reasoning.',
  'Hackathons and developer competitions are driving grassroots innovation in AI and software.',
]

export async function generateAIOverview(): Promise<OverviewData> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return { bullets: FALLBACK_BULLETS, fetchedAt: new Date().toISOString() }
  }

  // Fetch all sections in parallel, tolerating individual failures
  const results = await Promise.allSettled(SECTIONS.map((s) => s.fetch()))

  const headlineBlocks: string[] = []
  for (let i = 0; i < SECTIONS.length; i++) {
    const result = results[i]
    if (result.status === 'fulfilled' && result.value.length > 0) {
      headlineBlocks.push(`[${SECTIONS[i].label}] ${result.value.join(' / ')}`)
    }
  }

  if (headlineBlocks.length === 0) {
    return { bullets: FALLBACK_BULLETS, fetchedAt: new Date().toISOString() }
  }

  const prompt = `You are a daily intelligence briefing assistant. Below are today's top headlines across AI, policy, cybersecurity, venture capital, tech events, infrastructure, startups, and research papers.

Headlines:
${headlineBlocks.join('\n')}

Generate 8–12 concise bullet points summarizing the key takeaways, emerging themes, and things to watch. Each bullet should be one sentence, actionable, and analytical — not just restating headlines. Return only a JSON array of strings.`

  try {
    const client = new Anthropic({ apiKey })
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = message.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { type: 'text'; text: string }).text)
      .join('')

    // Extract JSON array from response
    const match = text.match(/\[[\s\S]*\]/)
    if (!match) {
      return { bullets: FALLBACK_BULLETS, fetchedAt: new Date().toISOString() }
    }

    const bullets = JSON.parse(match[0]) as string[]
    if (!Array.isArray(bullets) || bullets.length === 0) {
      return { bullets: FALLBACK_BULLETS, fetchedAt: new Date().toISOString() }
    }

    return { bullets, fetchedAt: new Date().toISOString() }
  } catch {
    return { bullets: FALLBACK_BULLETS, fetchedAt: new Date().toISOString() }
  }
}
