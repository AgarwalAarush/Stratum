import { buildCandidateWeeklySummary, candidateWeekStart } from '../markets/candidate-summary.ts'
import type { CandidateBrief, CandidateWeeklySummary } from '../markets/types.ts'
import { getSupabaseClient } from './supabase.ts'

interface CandidateWeeklySummaryOptions {
  weekEnding: string
  generatedAt?: string
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function candidateFromRow(row: Record<string, unknown>): CandidateBrief | null {
  const content = record(row.content)
  if (typeof content.symbol !== 'string' || typeof content.company !== 'string') return null
  return {
    ...content,
    id: String(row.id),
    symbol: String(row.symbol),
    company: String(row.company),
    sector: String(row.sector),
    subIndustry: String(row.sub_industry),
    tradingDate: String(row.trading_date),
    whySurfaced: String(row.why_surfaced),
    status: row.status as CandidateBrief['status'],
    generatedAt: String(row.generated_at),
  } as CandidateBrief
}

export async function materializeCandidateWeeklySummary(
  options: CandidateWeeklySummaryOptions,
): Promise<CandidateWeeklySummary> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const periodStart = candidateWeekStart(options.weekEnding)
  const generatedAt = options.generatedAt ?? new Date().toISOString()
  const { data, error } = await supabase
    .from('candidate_briefs')
    .select('id,symbol,company,sector,sub_industry,trading_date,why_surfaced,content,status,generated_at')
    .gte('trading_date', periodStart)
    .lte('trading_date', options.weekEnding)
  if (error) throw new Error(`Unable to load Candidate Scout briefs for weekly summary: ${error.message}`)

  const summary = buildCandidateWeeklySummary(
    (data ?? []).flatMap((row) => {
      const candidate = candidateFromRow(row as Record<string, unknown>)
      return candidate ? [candidate] : []
    }),
    { weekEnding: options.weekEnding, generatedAt },
  )
  const { error: persistError } = await supabase.from('candidate_weekly_summaries').upsert({
    week_ending: summary.weekEnding,
    period_start: summary.periodStart,
    candidate_count: summary.candidateCount,
    content: summary,
    generated_at: summary.generatedAt,
  }, { onConflict: 'week_ending' })
  if (persistError) throw new Error(`Unable to persist Candidate Scout weekly summary: ${persistError.message}`)
  return summary
}
