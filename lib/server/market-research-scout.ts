import { getMarketDomainPack } from '../markets/domain-packs.ts'
import { runCodexJson, type CodexExecResult } from './codex-exec.ts'
import { selectMarketModel } from './market-model-policy.ts'
import { getSupabaseClient } from './supabase.ts'

type RecordValue = Record<string, unknown>
export type MarketResearchScoutLead = {
  title: string; publisher: string; url: string; sourceType: string; claim: string; evidenceQuote: string
  supports: 'supports' | 'contradicts' | 'context'; limitations: string[]; recurringSourceCandidate: boolean
}
export type MarketResearchScoutResult = { leads: MarketResearchScoutLead[]; unresolvedQuestions: string[] }

function record(value: unknown): RecordValue { return value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {} }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim()) : [] }
function text(value: unknown, label: string, min: number, max: number): string {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) throw new Error(`Invalid research lead ${label}`)
  return value.trim()
}
function url(value: unknown): string { const parsed = new URL(text(value, 'URL', 8, 1200)); if (parsed.protocol !== 'https:') throw new Error('Research lead URL must use HTTPS'); return parsed.toString() }

export function validateMarketResearchScoutResult(value: unknown): MarketResearchScoutResult {
  const payload = record(value); const raw = Array.isArray(payload.leads) ? payload.leads : []
  if (raw.length < 1 || raw.length > 12) throw new Error('Research scout must return 1-12 leads')
  const seen = new Set<string>()
  const leads = raw.map((entry) => {
    const item = record(entry); const lead: MarketResearchScoutLead = {
      title: text(item.title, 'title', 4, 300), publisher: text(item.publisher, 'publisher', 2, 180), url: url(item.url), sourceType: text(item.sourceType, 'source type', 3, 80),
      claim: text(item.claim, 'claim', 10, 1200), evidenceQuote: text(item.evidenceQuote, 'quote', 8, 1000),
      supports: item.supports === 'supports' || item.supports === 'contradicts' || item.supports === 'context' ? item.supports : (() => { throw new Error('Invalid research lead stance') })(),
      limitations: strings(item.limitations).slice(0, 5), recurringSourceCandidate: Boolean(item.recurringSourceCandidate),
    }
    const key = `${lead.url}\u0000${lead.claim}`.toLowerCase(); if (seen.has(key)) throw new Error('Research scout returned duplicate leads'); seen.add(key)
    return lead
  })
  return { leads, unresolvedQuestions: strings(payload.unresolvedQuestions).slice(0, 8) }
}

export function buildMarketResearchScoutPrompt(domainId: string, reason: string): string {
  const domain = getMarketDomainPack(domainId); if (!domain) throw new Error(`Unknown market domain: ${domainId}`)
  return [
    'You are Stratum\'s broad market-research scout. Investigate a bounded question across the public web, seeking primary sources, operational evidence, informed dissent, specialist reporting, and technical work. You are not limited to an existing source registry.',
    'Return a compact lead dossier, not a thesis, recommendation, or market fact. Every lead must name a direct HTTPS URL and include a short attributable evidence quote. Include material counter-evidence when it exists; do not fill the dossier with sources that all agree.',
    'A lead is provisional: it cannot enter a market observation, baseline, hypothesis, prediction, or trade decision. Set recurringSourceCandidate true only for a stable, high-signal publisher/page worth later review for recurring collection; this flag does not create or approve a source contract.',
    `DOMAIN: ${JSON.stringify(domain)}`, `QUESTION / TRIGGER: ${reason}`,
  ].join('\n\n')
}

export async function runMarketResearchScout(input: { domainId: string; reason: string; frontierIds?: string[]; trigger?: 'frontier_gap' | 'manual'; runner?: (prompt: string) => Promise<CodexExecResult<MarketResearchScoutResult>> }): Promise<{ id: string; domainId: string; leads: MarketResearchScoutLead[]; unresolvedQuestions: string[]; model: string | null }> {
  const supabase = getSupabaseClient(); if (!supabase) throw new Error('Supabase service credentials are not configured')
  const domain = getMarketDomainPack(input.domainId); if (!domain) throw new Error(`Unknown market domain: ${input.domainId}`)
  const frontierIds = [...new Set((input.frontierIds ?? []).filter((id) => /^[0-9a-f-]{36}$/i.test(id)))].slice(0, 12)
  const { data: created, error } = await supabase.from('market_research_scout_runs').insert({ domain_id: domain.id, status: 'running', trigger: input.trigger ?? 'manual', reason: text(input.reason, 'reason', 4, 6000), frontier_ids: frontierIds }).select('id').single()
  if (error || !created) throw new Error(`Unable to create broad research-scout run: ${error?.message ?? 'unknown error'}`)
  try {
    const runner = input.runner ?? ((prompt: string) => runCodexJson({ prompt, schemaPath: 'schemas/market-research-scout.schema.json', validate: validateMarketResearchScoutResult, model: selectMarketModel('research_planning').model, timeoutMs: 8 * 60 * 1_000 }))
    const result = await runner(buildMarketResearchScoutPrompt(domain.id, input.reason)); const dossier = validateMarketResearchScoutResult(result.data)
    const { error: publishError } = await supabase.from('market_research_scout_runs').update({ status: 'complete', leads: dossier.leads, unresolved_questions: dossier.unresolvedQuestions, provider: result.metadata.provider, model: result.metadata.model, generated_at: new Date().toISOString() }).eq('id', created.id).eq('status', 'running')
    if (publishError) throw new Error(`Unable to publish broad research-scout run: ${publishError.message}`)
    return { id: String(created.id), domainId: domain.id, ...dossier, model: result.metadata.model }
  } catch (cause) { const message = cause instanceof Error ? cause.message : String(cause); await supabase.from('market_research_scout_runs').update({ status: 'failed', error: message }).eq('id', created.id); throw cause }
}
