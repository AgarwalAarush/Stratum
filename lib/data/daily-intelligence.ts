import type { OverviewData } from '../types.ts'
import { AI_MODELS } from '../ai/config.ts'
import { generateOpenAIJson } from '../server/openai-responses.ts'
import { runCodexJson } from '../server/codex-exec.ts'

export interface IntelligenceSourceItem { title: string; url: string; publishedAt?: string }
export interface IntelligenceSection { label: string; fetch: () => Promise<IntelligenceSourceItem[]> }
export interface DailyIntelligenceOptions { provider?: 'responses' | 'codex'; now?: Date }

/** One daily synthesis contract. Failed collection/generation never becomes fresh prose. */
export async function synthesizeDailyIntelligence(sections: IntelligenceSection[], topic: string,
  options: DailyIntelligenceOptions = {}): Promise<OverviewData> {
  const now = options.now ?? new Date()
  const stamp = now.toISOString()
  const empty = (readiness: 'blocked' | 'failed', reason: string): OverviewData => ({
    bullets: [], fetchedAt: stamp, readiness, generatedAt: null, dataAsOf: null, errors: [reason], sourceCoverage: [], sources: [],
  })
  if (options.provider !== 'codex' && !process.env.OPENAI_API_KEY) return empty('blocked', 'OpenAI generation is not configured')
  const results = await Promise.allSettled(sections.map(section => section.fetch()))
  const coverage = results.map((r, i) => ({ source: sections[i].label, status: r.status === 'rejected' ? 'failed' as const : r.value.length ? 'complete' as const : 'partial' as const, count: r.status === 'fulfilled' ? r.value.length : 0 }))
  const byUrl = new Map<string, { title: string; url: string; publishedAt: string | null; availableAt: string; retrievedAt: string; section: string }>()
  for (let i = 0; i < results.length; i++) {
    const result = results[i]
    if (result.status !== 'fulfilled') continue
    for (const item of result.value) {
      if (!item.title || !/^https?:\/\//.test(item.url)) continue
      const published = item.publishedAt && Date.parse(item.publishedAt) <= now.getTime() ? item.publishedAt : null
      byUrl.set(item.url, { title: item.title, url: item.url, publishedAt: published, availableAt: stamp, retrievedAt: stamp, section: sections[i].label })
    }
  }
  const sources = [...byUrl.values()].map((source, index) => ({ ...source, id: String(index + 1) }))
  if (!sources.length) return { ...empty('blocked', 'No usable source headlines were collected'), sourceCoverage: coverage }
  const prompt = `Write a concise ${topic} intelligence update from the following observed headlines. Headlines are limited evidence, not verified article content. Separate tentative implications from observed events; do not invent numerical facts or current conditions. Use only these sources. Produce up to 12 useful bullets, fewer when evidence is sparse. Every bullet must cite at least one source as [n]. No generic filler.\n${sources.map(s => `[${s.id}] [${s.section}] ${s.title}\n${s.url}`).join('\n')}`
  const schema = { type: 'object', properties: { bullets: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 12 } }, required: ['bullets'], additionalProperties: false }
  const validate = (value: unknown) => {
    const bullets = (value as { bullets?: unknown } | null)?.bullets
    if (!Array.isArray(bullets) || !bullets.length || bullets.length > 12 || !bullets.every(b => typeof b === 'string')) throw new Error('Invalid intelligence bullets')
    for (const bullet of bullets as string[]) {
      const citations = [...bullet.matchAll(/\[(\d+)\]/g)].map(m => Number(m[1]))
      if (!citations.length || citations.some(n => n < 1 || n > sources.length)) throw new Error('Intelligence bullet has missing or unknown citations')
    }
    return { bullets: bullets as string[] }
  }
  try {
    const result = options.provider === 'codex'
      ? await runCodexJson({ prompt, schemaPath: 'schemas/daily-intelligence.schema.json', model: AI_MODELS.dailyOverview, validate })
      : await generateOpenAIJson({ apiKey: process.env.OPENAI_API_KEY!, model: AI_MODELS.dailyOverview, input: prompt, schemaName: 'daily_intelligence', schema, maxOutputTokens: 2048, validate })
    const dates = sources.flatMap(s => s.publishedAt ? [s.publishedAt] : []).sort()
    return { bullets: result.data.bullets.map(b => b.replace(/\[(\d+)\]/g, (_, n) => `[${n}](${sources[Number(n) - 1].url})`)),
      fetchedAt: stamp, generatedAt: stamp, dataAsOf: dates.at(-1) ?? null,
      readiness: coverage.every(c => c.status === 'complete') ? 'complete' : 'partial',
      errors: coverage.filter(c => c.status !== 'complete').map(c => `${c.source}: ${c.status}`), sourceCoverage: coverage, sources, generation: result.metadata }
  } catch (error) {
    return { ...empty('failed', error instanceof Error ? error.message : 'Generation failed'), sourceCoverage: coverage, sources }
  }
}
