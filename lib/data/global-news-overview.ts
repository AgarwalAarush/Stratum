import Anthropic from '@anthropic-ai/sdk'
import type { OverviewData } from '../types.ts'
import { fetchNewsItemsByTopic } from './rss.ts'

interface SourceItem {
  title: string
  url: string
}

const SECTIONS: Array<{ label: string; fetch: () => Promise<SourceItem[]> }> = [
  {
    label: 'GEOPOLITICS',
    fetch: async () => {
      const items = await fetchNewsItemsByTopic('geopolitics', 5)
      return items.map((i) => ({ title: i.title, url: i.url }))
    },
  },
  {
    label: 'EUROPEAN UNION',
    fetch: async () => {
      const items = await fetchNewsItemsByTopic('european-union', 5)
      return items.map((i) => ({ title: i.title, url: i.url }))
    },
  },
  {
    label: 'CLIMATE & ENVIRONMENT',
    fetch: async () => {
      const items = await fetchNewsItemsByTopic('climate-environment', 5)
      return items.map((i) => ({ title: i.title, url: i.url }))
    },
  },
  {
    label: 'GLOBAL SUPPLY CHAINS',
    fetch: async () => {
      const items = await fetchNewsItemsByTopic('global-supply-chains', 5)
      return items.map((i) => ({ title: i.title, url: i.url }))
    },
  },
  {
    label: 'GLOBAL SUMMITS',
    fetch: async () => {
      const items = await fetchNewsItemsByTopic('global-summits', 5)
      return items.map((i) => ({ title: i.title, url: i.url }))
    },
  },
  {
    label: 'GLOBAL HEALTH',
    fetch: async () => {
      const items = await fetchNewsItemsByTopic('global-health', 5)
      return items.map((i) => ({ title: i.title, url: i.url }))
    },
  },
]

const FALLBACK_BULLETS = [
  'Geopolitical tensions continue to reshape trade alliances and diplomatic relationships across major regions.',
  'European Union policy shifts are driving regulatory changes with global implications.',
  'Climate-related events are increasingly disrupting supply chains and economic planning.',
  'Global supply chain vulnerabilities remain elevated amid shifting trade corridors.',
  'International summits are producing mixed results on key multilateral agreements.',
  'Public health infrastructure investments are accelerating in response to emerging threats.',
]

export async function generateGlobalNewsOverview(): Promise<OverviewData> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return { bullets: FALLBACK_BULLETS, fetchedAt: new Date().toISOString() }
  }

  const results = await Promise.allSettled(SECTIONS.map((s) => s.fetch()))

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

  const prompt = `You are a daily intelligence briefing assistant focused on global affairs. Below are today's top headlines across geopolitics, EU policy, climate & environment, global supply chains, international summits, and global health. Each headline has a numbered source reference.

Headlines:
${headlineBlocks.join('\n')}

Sources:
${sourcesBlock}

Generate 6–10 concise bullet points summarizing the key takeaways, emerging crises, diplomatic shifts, supply chain disruptions, and things to watch. Each bullet should be one sentence, actionable, and analytical — not just restating headlines.

When a bullet draws from a specific headline, cite it as [n] using the headline number. Place citations at the end of the relevant clause. A bullet may have 0-3 citations.

Return only a JSON array of strings.`

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

    const match = text.match(/\[[\s\S]*\]/)
    if (!match) {
      return { bullets: FALLBACK_BULLETS, fetchedAt: new Date().toISOString() }
    }

    const bullets = JSON.parse(match[0]) as string[]
    if (!Array.isArray(bullets) || bullets.length === 0) {
      return { bullets: FALLBACK_BULLETS, fetchedAt: new Date().toISOString() }
    }

    const sourceMap = new Map(sourceIndex.map((s) => [s.n, s.url]))
    const processed = bullets.map((b) =>
      b.replace(/\[[\d,\s-]+\]/g, (full) => {
        const inner = full.slice(1, -1)
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
