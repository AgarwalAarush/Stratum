import Anthropic from '@anthropic-ai/sdk'
import type { MorningBriefData } from '../types'
import { fetchNewsItemsByTopic } from './rss'
import { fetchArxivPapers } from './arxiv'
import { fetchTrendingRepos } from './repos'
import { fetchDiscussions } from './discussions'
import { fetchFinanceEarnings } from './finance-earnings'
import { fetchFinanceDeals } from './finance-deals'
import { fetchFinanceReports } from './finance-reports'
import { fetchMacroIndicators } from './finance-macro'

interface SourceItem {
  title: string
  url: string
}

const SECTIONS: Array<{ label: string; fetch: () => Promise<SourceItem[]> }> = [
  {
    label: 'GENERAL AI',
    fetch: async () => {
      const items = await fetchNewsItemsByTopic('general', 5)
      return items.map((i) => ({ title: i.title, url: i.url }))
    },
  },
  {
    label: 'POLICY',
    fetch: async () => {
      const items = await fetchNewsItemsByTopic('policy', 5)
      return items.map((i) => ({ title: i.title, url: i.url }))
    },
  },
  {
    label: 'CYBERSECURITY',
    fetch: async () => {
      const items = await fetchNewsItemsByTopic('cybersecurity', 5)
      return items.map((i) => ({ title: i.title, url: i.url }))
    },
  },
  {
    label: 'VENTURE CAPITAL',
    fetch: async () => {
      const items = await fetchNewsItemsByTopic('venture-capital', 5)
      return items.map((i) => ({ title: i.title, url: i.url }))
    },
  },
  {
    label: 'TECH EVENTS',
    fetch: async () => {
      const items = await fetchNewsItemsByTopic('tech-events', 5)
      return items.map((i) => ({ title: i.title, url: i.url }))
    },
  },
  {
    label: 'INFRA & HARDWARE',
    fetch: async () => {
      const items = await fetchNewsItemsByTopic('infra-hardware', 5)
      return items.map((i) => ({ title: i.title, url: i.url }))
    },
  },
  {
    label: 'NEW TECHNOLOGY',
    fetch: async () => {
      const items = await fetchNewsItemsByTopic('new-technology', 5)
      return items.map((i) => ({ title: i.title, url: i.url }))
    },
  },
  {
    label: 'STARTUPS',
    fetch: async () => {
      const items = await fetchNewsItemsByTopic('startups', 5)
      return items.map((i) => ({ title: i.title, url: i.url }))
    },
  },
  {
    label: 'PAPERS',
    fetch: async () => {
      const items = await fetchArxivPapers(5)
      return items.map((i) => ({ title: i.title, url: i.url }))
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
      return items.map((i) => ({ title: i.title, url: i.url }))
    },
  },
  {
    label: 'EARNINGS',
    fetch: async () => {
      const items = await fetchFinanceEarnings(5)
      return items.map((i) => ({ title: `${i.ticker} ${i.quarter} earnings${i.beat !== undefined ? (i.beat ? ' (beat)' : ' (miss)') : ''}`, url: i.url }))
    },
  },
  {
    label: 'DEALS & M&A',
    fetch: async () => {
      const items = await fetchFinanceDeals(5)
      return items.map((i) => ({ title: i.title, url: i.url }))
    },
  },
  {
    label: 'RESEARCH REPORTS',
    fetch: async () => {
      const items = await fetchFinanceReports(5)
      return items.map((i) => ({ title: i.title, url: i.url }))
    },
  },
  {
    label: 'MACRO INDICATORS',
    fetch: async () => {
      const items = await fetchMacroIndicators(5)
      return items.map((i) => ({ title: i.title, url: i.url }))
    },
  },
]

const FALLBACK_BRIEF: MorningBriefData = {
  headline: 'Morning brief generation is temporarily unavailable.',
  sections: [
    {
      title: 'AI & Research',
      bullets: [
        'AI development continues to accelerate across research and enterprise.',
        'Open-source models are narrowing the gap with frontier proprietary systems.',
        'Academic research pushes boundaries in multimodal understanding.',
      ],
    },
    {
      title: 'Finance & Markets',
      bullets: [
        'Infrastructure investments in AI remain at record levels.',
        'Venture capital activity in AI startups shows continued momentum.',
      ],
    },
  ],
  watchList: [
    'Monitor upcoming earnings from major tech companies.',
    'Track policy developments around AI regulation.',
  ],
  itemCount: 0,
  generatedAt: new Date().toISOString(),
  fetchedAt: new Date().toISOString(),
}

export async function generateMorningBrief(): Promise<MorningBriefData> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return { ...FALLBACK_BRIEF, fetchedAt: new Date().toISOString() }
  }

  const results = await Promise.allSettled(SECTIONS.map((s) => s.fetch()))

  const headlineBlocks: string[] = []
  const sourceIndex: Array<{ n: number; url: string }> = []
  let sourceCounter = 1
  let totalItems = 0

  for (let i = 0; i < SECTIONS.length; i++) {
    const result = results[i]
    if (result.status === 'fulfilled' && result.value.length > 0) {
      totalItems += result.value.length
      const numberedItems = result.value.map((item) => {
        const n = sourceCounter++
        sourceIndex.push({ n, url: item.url })
        return `[${n}] ${item.title}`
      })
      headlineBlocks.push(`[${SECTIONS[i].label}] ${numberedItems.join(' / ')}`)
    }
  }

  if (headlineBlocks.length === 0) {
    return { ...FALLBACK_BRIEF, fetchedAt: new Date().toISOString() }
  }

  const sourcesBlock = sourceIndex.map((s) => `[${s.n}] ${s.url}`).join('\n')

  const prompt = `You are a morning intelligence briefing writer for Stratum, a tech intelligence dashboard. Below are the latest headlines across AI research, policy, cybersecurity, venture capital, tech events, infrastructure, startups, papers, repos, discussions, earnings, deals, research reports, and macro indicators. Each headline has a numbered source reference.

Headlines:
${headlineBlocks.join('\n')}

Sources:
${sourcesBlock}

Generate a structured morning brief as JSON matching this exact schema:
{
  "headline": "One sharp summary sentence capturing today's most important signal",
  "sections": [
    {
      "title": "Section Name (e.g. AI & Research, Finance & Markets, Policy & Security, Infrastructure & Ecosystem)",
      "bullets": ["3-5 analytical bullets with [n] citations"]
    }
  ],
  "watchList": ["3-5 forward-looking items to watch (upcoming earnings, conferences, policy deadlines, etc.)"]
}

Requirements:
- 3-5 thematic sections with 3-5 bullets each
- Bullets should be analytical and draw connections, not just restate headlines
- Citations as [n] using the headline numbers, placed at the end of relevant clauses
- headline: one sharp, specific sentence (not generic)
- watchList: forward-looking items only
- Return ONLY valid JSON, no markdown fences`

  try {
    const client = new Anthropic({ apiKey })
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 3072,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = message.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { type: 'text'; text: string }).text)
      .join('')

    const match = text.match(/\{[\s\S]*\}/)
    if (!match) {
      return { ...FALLBACK_BRIEF, fetchedAt: new Date().toISOString() }
    }

    const parsed = JSON.parse(match[0]) as {
      headline: string
      sections: Array<{ title: string; bullets: string[] }>
      watchList: string[]
    }

    if (!parsed.headline || !Array.isArray(parsed.sections)) {
      return { ...FALLBACK_BRIEF, fetchedAt: new Date().toISOString() }
    }

    // Expand bare [n] references into [n](url) markdown links
    const sourceMap = new Map(sourceIndex.map((s) => [s.n, s.url]))
    const expandCitations = (str: string) =>
      str.replace(/\[(\d+)\]/g, (full, num) => {
        const url = sourceMap.get(Number(num))
        return url ? `[${num}](${url})` : full
      })

    const sections = parsed.sections.map((s) => ({
      title: s.title,
      bullets: s.bullets.map(expandCitations),
    }))

    const watchList = (parsed.watchList || []).map(expandCitations)

    const now = new Date().toISOString()
    return {
      headline: expandCitations(parsed.headline),
      sections,
      watchList,
      itemCount: totalItems,
      generatedAt: now,
      fetchedAt: now,
    }
  } catch {
    return { ...FALLBACK_BRIEF, fetchedAt: new Date().toISOString() }
  }
}
