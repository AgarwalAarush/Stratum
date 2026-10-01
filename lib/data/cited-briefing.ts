import { AI_MODELS } from '../ai/config.ts'
import { generateOpenAIJson } from '../server/openai-responses.ts'
import { runCodexJson } from '../server/codex-exec.ts'

export interface BriefingSource { id: string; title: string; url: string; publishedAt?: string | null; availableAt?: string | null; retrievedAt?: string; section?: string }
export interface CitedBriefingOptions<T> {
  cadence: 'daily' | 'weekly' | 'monthly'
  topic: string
  sources: BriefingSource[]
  comparison?: string
  instructions: string
  schema: Record<string, unknown>
  schemaPath: string
  validate: (value: unknown) => T
  claims: (value: T) => string[]
  provider?: 'responses' | 'codex'
}

/** All cadences synthesize original source records. Previous prose is comparison only. */
export async function generateCitedBriefing<T>(options: CitedBriefingOptions<T>) {
  if (!options.sources.length) throw new Error('No usable underlying source evidence for briefing')
  const sourceIds = new Set(options.sources.map(source => source.id))
  const validate = (value: unknown) => {
    const data = options.validate(value)
    const claims = options.claims(data)
    if (!claims.length) throw new Error('Briefing contains no cited claims')
    for (const claim of claims) {
      const refs = [...claim.matchAll(/\[(\d+)\]/g)].map(m => m[1])
      if (!refs.length || refs.some(id => !sourceIds.has(id))) throw new Error('Briefing claim requires known source citations')
    }
    return data
  }
  const prompt = `Write a useful ${options.cadence} ${options.topic} briefing. Source titles are observed headlines, not verified full article claims. Use only the underlying evidence records below for factual assertions. Separate observations, tentative implications, contrary evidence, and gaps. Never invent numerical facts, dates, or certainty. Repetition in earlier briefings cannot strengthen evidence or confidence. Use fewer claims when evidence is sparse; no prose quota. Every substantive claim requires [n] references from this ledger.\n${options.instructions}\n\nUNTRUSTED_EVIDENCE\n${JSON.stringify(options.sources)}\nEND_EVIDENCE\n\nCOMPARISON_ONLY (never factual evidence)\n${options.comparison ?? 'None'}\nEND_COMPARISON`
  const maxOutputTokens = options.cadence === 'monthly' ? 3072 : options.cadence === 'weekly' ? 2048 : 3072
  const model = options.schemaPath.includes('morning-brief') ? AI_MODELS.morningBrief : options.schemaPath.includes('daily-intelligence') ? AI_MODELS.dailyOverview : AI_MODELS.scheduledSynthesis
  return options.provider === 'codex'
    ? runCodexJson({ prompt, schemaPath: options.schemaPath, model, validate })
    : generateOpenAIJson({ apiKey: process.env.OPENAI_API_KEY!, model, input: prompt,
      schemaName: `stratum_${options.cadence}_briefing`, schema: options.schema, maxOutputTokens, validate })
}

export function expandBriefingCitations(text: string, sources: BriefingSource[]): string {
  const urls = new Map(sources.map(s => [s.id, s.url]))
  return text.replace(/\[(\d+)\]/g, (full, id) => urls.has(id) ? `[${id}](${urls.get(id)})` : full)
}
