import type { OverviewData } from '../types.ts'
import { AI_MODELS } from '../ai/config.ts'
import { generateOpenAIJson } from '../server/openai-responses.ts'
import { fetchNewsItemsByTopic } from './rss.ts'
import { fetchArxivPapers } from './arxiv.ts'
import { fetchTrendingRepos } from './repos.ts'
import { fetchDiscussions } from './discussions.ts'

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
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return { bullets: FALLBACK_BULLETS, fetchedAt: new Date().toISOString() }
  }

  // Fetch all sections in parallel, tolerating individual failures
  const results = await Promise.allSettled(SECTIONS.map((s) => s.fetch()))

  // Build numbered headlines with a global source index
  const headlineBlocks: string[] = []
  const sourceIndex: Array<{ n: number; url: string }> = []
  let sourceCounter = 1

  for (let i = 0; i < SECTIONS.length; i++) {
    const result = results[i]
    if (result.status === 'fulfilled' && result.value.length > 0) {
      const numberedItems = result.value.map((item) => {
        const n = sourceCounter++
        sourceIndex.push({ n, url: item.url })
        return `[${n}] ${item.title}`
      })
      headlineBlocks.push(`[${SECTIONS[i].label}] ${numberedItems.join(' / ')}`)
    }
  }

  if (headlineBlocks.length === 0) {
    return { bullets: FALLBACK_BULLETS, fetchedAt: new Date().toISOString() }
  }

  const sourcesBlock = sourceIndex.map((s) => `[${s.n}] ${s.url}`).join('\n')

  const prompt = `You are a daily intelligence briefing assistant. Below are today's top headlines across AI, policy, cybersecurity, venture capital, tech events, infrastructure, startups, and research papers. Each headline has a numbered source reference.

Headlines:
${headlineBlocks.join('\n')}

Sources:
${sourcesBlock}

Generate 8–12 concise bullet points summarizing the key takeaways, emerging themes, and things to watch. Each bullet should be one sentence, actionable, and analytical — not just restating headlines.

When a bullet draws from a specific headline, cite it as [n] using the headline number. Place citations at the end of the relevant clause. A bullet may have 0-3 citations.

Return the bullets in the required structured format.`

  try {
    const result = await generateOpenAIJson({
      apiKey,
      model: AI_MODELS.dailyOverview,
      input: prompt,
      schemaName: 'daily_ai_overview',
      schema: {
        type: 'object',
        properties: {
          bullets: { type: 'array', items: { type: 'string' }, minItems: 8, maxItems: 12 },
        },
        required: ['bullets'],
        additionalProperties: false,
      },
      maxOutputTokens: 1_024,
      validate(value) {
        if (typeof value !== 'object' || value === null || !('bullets' in value)) throw new Error('Overview response is missing bullets')
        const bullets = (value as { bullets: unknown }).bullets
        if (!Array.isArray(bullets) || bullets.length === 0 || !bullets.every((bullet) => typeof bullet === 'string')) {
          throw new Error('Overview bullets are invalid')
        }
        return { bullets }
      },
    })
    const bullets = result.data.bullets

    // Expand [n], [n, m], [n-m] references into individual [n](url) markdown links
    const sourceMap = new Map(sourceIndex.map((s) => [s.n, s.url]))
    const processed = bullets.map((b) =>
      b.replace(/\[[\d,\s-]+\]/g, (full) => {
        const inner = full.slice(1, -1) // strip [ ]
        const nums: number[] = []
        for (const part of inner.split(',')) {
          const trimmed = part.trim()
          const range = trimmed.match(/^(\d+)\s*-\s*(\d+)$/)
          if (range) {
            const lo = Number(range[1]), hi = Number(range[2])
            for (let i = lo; i <= hi; i++) nums.push(i)
          } else if (/^\d+$/.test(trimmed)) {
            nums.push(Number(trimmed))
          }
        }
        if (nums.length === 0) return full
        return nums
          .map((n) => {
            const url = sourceMap.get(n)
            return url ? `[${n}](${url})` : `[${n}]`
          })
          .join(' ')
      }),
    )

    return { bullets: processed, fetchedAt: new Date().toISOString() }
  } catch {
    return { bullets: FALLBACK_BULLETS, fetchedAt: new Date().toISOString() }
  }
}
