import type { MorningBriefData } from '../types.ts'
import { AI_MODELS } from '../ai/config.ts'
import { generateOpenAIJson } from '../server/openai-responses.ts'
import { runCodexJson } from '../server/codex-exec.ts'
import { fetchNewsItemsByTopic } from './rss.ts'
import { fetchArxivPapers } from './arxiv.ts'
import { fetchTrendingRepos } from './repos.ts'
import { fetchDiscussions } from './discussions.ts'
import { fetchFinanceEarnings } from './finance-earnings.ts'
import { fetchFinanceDeals } from './finance-deals.ts'
import { fetchFinanceReports } from './finance-reports.ts'
import { fetchMacroIndicators } from './finance-macro.ts'
import {
  fetchRecentFeedItems,
  fetchYesterdaysBrief,
  type FeedItemRow,
} from './overview-persistence.ts'
import { retrieveWorldMemory } from '../server/world-retrieval.ts'

interface SourceItem {
  title: string
  url: string
  publishedAt?: string | null
  retrievedAt?: string
  detail?: string
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
      return items.map((i) => ({
        ...i,
        title: i.title,
        url: i.url,
        detail: i.categories.join(', '),
      }))
    },
  },
  {
    label: 'REPOS',
    fetch: async () => {
      const items = await fetchTrendingRepos(5)
      if (!items) return []
      return items.map((i) => ({
        ...i,
        title: `${i.owner}/${i.name}: ${i.description}`,
        url: i.url,
        detail: `${i.totalStars} stars, ${i.language}`,
      }))
    },
  },
  {
    label: 'DISCUSSIONS',
    fetch: async () => {
      const items = await fetchDiscussions(5)
      return items.map((i) => ({
        ...i,
        title: i.title,
        url: i.url,
        detail: `${i.points} pts, ${i.commentCount} comments`,
      }))
    },
  },
  {
    label: 'EARNINGS',
    fetch: async () => {
      const items = await fetchFinanceEarnings(5)
      return items.map((i) => ({
        ...i,
        title: `${i.ticker} ${i.quarter} earnings${i.beat !== undefined ? (i.beat ? ' (beat)' : ' (miss)') : ''}`,
        url: i.url,
        detail: i.epsActual !== undefined ? `EPS: ${i.epsActual}` : undefined,
      }))
    },
  },
  {
    label: 'DEALS & M&A',
    fetch: async () => {
      const items = await fetchFinanceDeals(5)
      return items.map((i) => ({ ...i, title: i.title, url: i.url }))
    },
  },
  {
    label: 'RESEARCH REPORTS',
    fetch: async () => {
      const items = await fetchFinanceReports(5)
      return items.map((i) => ({ ...i, title: i.title, url: i.url }))
    },
  },
  {
    label: 'MACRO INDICATORS',
    fetch: async () => {
      const items = await fetchMacroIndicators(5)
      return items.map((i) => ({ ...i, title: i.title, url: i.url }))
    },
  },
]

function unavailableBrief(readiness: 'blocked' | 'failed', reason: string): MorningBriefData {
  return { headline: '', sections: [], watchList: [], itemCount: 0, generatedAt: '', fetchedAt: new Date().toISOString(), dataAsOf: null, readiness, errors: [reason], sourceCoverage: [], sources: [] }
}

function feedItemRowToSourceItem(row: FeedItemRow): SourceItem {
  const meta = row.metadata as Record<string, unknown>
  let detail: string | undefined
  switch (row.item_type) {
    case 'paper':
      if (Array.isArray(meta.categories)) detail = (meta.categories as string[]).join(', ')
      break
    case 'repo':
      detail = [meta.totalStars && `${meta.totalStars} stars`, meta.language].filter(Boolean).join(', ')
      break
    case 'discussion':
      detail = [meta.points && `${meta.points} pts`, meta.commentCount && `${meta.commentCount} comments`].filter(Boolean).join(', ')
      break
    case 'earnings':
      detail = meta.epsActual !== undefined ? `EPS: ${meta.epsActual}` : undefined
      break
  }
  return { title: row.title, url: row.url, publishedAt: row.published_at, retrievedAt: row.fetched_at, detail: detail || undefined }
}

interface MorningBriefGenerationOptions {
  provider?: 'responses' | 'codex'
}

interface GeneratedMorningBrief {
  headline: string
  sections: Array<{ title: string; bullets: string[] }>
  watchList: string[]
}

function validateMorningBrief(value: unknown): GeneratedMorningBrief {
  if (typeof value !== 'object' || value === null) throw new Error('Morning brief response is invalid')
  const brief = value as { headline?: unknown; sections?: unknown; watchList?: unknown }
  if (typeof brief.headline !== 'string' || !Array.isArray(brief.sections) || !Array.isArray(brief.watchList)) {
    throw new Error('Morning brief response is incomplete')
  }
  const sections = brief.sections.map((section) => {
    if (typeof section !== 'object' || section === null) throw new Error('Morning brief section is invalid')
    const candidate = section as { title?: unknown; bullets?: unknown }
    if (typeof candidate.title !== 'string' || !Array.isArray(candidate.bullets) || !candidate.bullets.every((bullet) => typeof bullet === 'string')) {
      throw new Error('Morning brief section is incomplete')
    }
    return { title: candidate.title, bullets: candidate.bullets as string[] }
  })
  if (!brief.watchList.every((item) => typeof item === 'string')) throw new Error('Morning brief watch list is invalid')
  return { headline: brief.headline, sections, watchList: brief.watchList as string[] }
}

export async function generateMorningBrief(options: MorningBriefGenerationOptions = {}): Promise<MorningBriefData> {
  const apiKey = process.env.OPENAI_API_KEY
  if (options.provider !== 'codex' && !apiKey) {
    return unavailableBrief('blocked', 'OpenAI credentials are not configured')
  }

  // Fetch live items, historical items, and yesterday's brief in parallel
  const [liveResults, recentItems, yesterdaysBrief, worldRecall] = await Promise.all([
    Promise.allSettled(SECTIONS.map((s) => s.fetch())),
    fetchRecentFeedItems(24),
    fetchYesterdaysBrief(),
    retrieveWorldMemory({query:'technology AI power semiconductor macro policy demand constraint',limit:6}).catch(() => null),
  ])

  // Build live source items with labels
  const liveByUrl = new Map<string, { label: string; item: SourceItem }>()
  for (let i = 0; i < SECTIONS.length; i++) {
    const result = liveResults[i]
    if (result.status === 'fulfilled' && result.value.length > 0) {
      for (const item of result.value) {
        liveByUrl.set(item.url, { label: SECTIONS[i].label, item })
      }
    }
  }

  // Merge Supabase historical items (live wins on dedup)
  const historicalByUrl = new Map<string, { label: string; item: SourceItem }>()
  for (const row of recentItems) {
    if (!liveByUrl.has(row.url)) {
      const label = `${row.scope.toUpperCase()}/${row.section.toUpperCase()}`
      historicalByUrl.set(row.url, { label, item: feedItemRowToSourceItem(row) })
    }
  }

  // Combine: live first, then historical
  const allItems = [...liveByUrl.values(), ...historicalByUrl.values()]

  if (allItems.length === 0) {
    return unavailableBrief('blocked', 'No usable source evidence was collected')
  }

  // Group by label for the prompt
  const grouped = new Map<string, SourceItem[]>()
  for (const { label, item } of allItems) {
    const list = grouped.get(label) ?? []
    list.push(item)
    grouped.set(label, list)
  }

  const headlineBlocks: string[] = []
  const collectedAt = new Date().toISOString()
  const sourceCoverage = liveResults.map((r, i) => ({ source: SECTIONS[i].label, status: r.status === 'rejected' ? 'failed' as const : r.value.length ? 'complete' as const : 'partial' as const, count: r.status === 'fulfilled' ? r.value.length : 0 }))
  const errors = liveResults.flatMap((r, i) => r.status === 'rejected' ? [`${SECTIONS[i].label}: ${String(r.reason)}`] : r.value.length ? [] : [`${SECTIONS[i].label}: no usable records`])
  const sourceIndex: Array<{ n: number; url: string; title: string; publishedAt: string | null; availableAt: string; retrievedAt: string; section: string }> = []
  let sourceCounter = 1
  let totalItems = 0

  for (const [label, items] of grouped) {
    totalItems += items.length
    const numberedItems = items.map((item) => {
      const n = sourceCounter++
      sourceIndex.push({ n, url: item.url, title: item.title, publishedAt: item.publishedAt ?? null, availableAt: item.retrievedAt ?? collectedAt, retrievedAt: item.retrievedAt ?? collectedAt, section: label })
      const detailSuffix = item.detail ? ` (${item.detail})` : ''
      return `[${n}] ${item.title}${detailSuffix}`
    })
    headlineBlocks.push(`[${label}] ${numberedItems.join(' / ')}`)
  }

  const sourcesBlock = sourceIndex.map((s) => `[${s.n}] ${s.url}`).join('\n')

  // Build yesterday's context block
  let yesterdayBlock = ''
  if (yesterdaysBrief) {
    const sectionTitles = yesterdaysBrief.sections.map((s) => s.title).join(', ')
    const watchItems = yesterdaysBrief.watchList.slice(0, 3).join('; ')
    yesterdayBlock = `

Yesterday's Brief Context:
- Headline: ${yesterdaysBrief.headline}
- Sections covered: ${sectionTitles}
- Watch list: ${watchItems}

Previous prose is comparison context, never evidence. Note developing stories and whether yesterday's watch list items have materialized in today's headlines.`
  }
  const worldBlock = worldRecall?.bundles.length ? `
Shadow World memory (retrieval receipt ${worldRecall.receipt.id}, commit ${worldRecall.receipt.commit}):
${JSON.stringify(worldRecall.bundles.map(b=>({claim:b.claim,acceptedAt:b.acceptedAt,freshness:b.freshness,sources:b.sources,counterevidence:b.counterevidence})))}
Use this context to nominate questions and explain uncertainty. World assessments are not verified current source facts or capital recommendations. Cite the supplied primary headlines for briefing conclusions.` : ''

  const prompt = `You are a morning intelligence briefing writer for Stratum, a tech intelligence dashboard. Below are the latest headlines across AI research, policy, cybersecurity, venture capital, tech events, infrastructure, startups, papers, repos, discussions, earnings, deals, research reports, and macro indicators. Each headline has a numbered source reference. Some items include metadata details in parentheses (categories, star counts, engagement metrics, EPS figures) — use these for richer analysis.

Headlines:
${headlineBlocks.join('\n')}

Sources:
${sourcesBlock}${yesterdayBlock}${worldBlock}

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
- Use metadata details (star counts, EPS, categories) to add quantitative depth
- Citations as [n] using the headline numbers, placed at the end of relevant clauses
- headline: one sharp, specific sentence (not generic)
- watchList: forward-looking items only
- Return only the required structured response`

  try {
    const schema = {
        type: 'object',
        properties: {
          headline: { type: 'string' },
          sections: {
            type: 'array',
            minItems: 3,
            maxItems: 5,
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                bullets: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 5 },
              },
              required: ['title', 'bullets'],
              additionalProperties: false,
            },
          },
          watchList: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 5 },
        },
        required: ['headline', 'sections', 'watchList'],
        additionalProperties: false,
      }
    const result = options.provider === 'codex'
      ? await runCodexJson({ prompt, schemaPath: 'schemas/morning-brief.schema.json', validate: validateMorningBrief })
      : await generateOpenAIJson({
        apiKey: apiKey!,
        model: AI_MODELS.morningBrief,
        input: prompt,
        schemaName: 'stratum_morning_brief',
        schema,
        maxOutputTokens: 3_072,
        validate: validateMorningBrief,
      })
    const parsed = result.data

    if (!parsed.sections.length || parsed.sections.some(section => !section.bullets.length || section.bullets.some(bullet => { const refs = [...bullet.matchAll(/\[(\d+)\]/g)].map(m => Number(m[1])); return !refs.length || refs.some(n => !sourceIndex.some(source => source.n === n)) }))) throw new Error('Morning brief requires valid source citations for every bullet')

    // Expand bare [n] references into [n](url) markdown links
    const sourceMap = new Map(sourceIndex.map((s) => [s.n, s.url]))
    const expandCitations = (str: string) =>
      str.replace(/\[(\d+)\]/g, (full, num) => {
        const url = sourceMap.get(Number(num))
        return url ? `[${num}](${url})` : full
      })

    const generatedSections = parsed.sections.map((s) => ({
      title: s.title,
      bullets: s.bullets.map(expandCitations),
    }))
    const sections = generatedSections

    const watchList = (parsed.watchList || []).map(expandCitations)

    const now = new Date().toISOString()
    return {
      readiness: errors.length ? 'partial' : 'complete',
      errors, sourceCoverage,
      dataAsOf: sourceIndex.flatMap(source => source.publishedAt ? [source.publishedAt] : []).sort().at(-1) ?? null,
      sources: sourceIndex.map(({ n, ...source }) => ({ ...source, id: String(n) })),
      generation: result.metadata,
      headline: expandCitations(parsed.headline),
      sections,
      watchList,
      itemCount: totalItems,
      generatedAt: now,
      fetchedAt: now,
    }
  } catch (error) {
    return unavailableBrief('failed', error instanceof Error ? error.message : String(error))
  }
}
