import type { ResearchFeedback } from '../markets/research-feedback.ts'
import type { CompanyPacketSource } from '../markets/types.ts'
import { getSupabaseClient } from './supabase.ts'

/** Bounded, dated feedback from this issuer's issued decisions. No brokerage
 * inference, model grading, or claims that every historical record was read. */
export async function loadResearchFeedback(ownerId: string, symbol: string, cutoff: string): Promise<ResearchFeedback> {
  const db = getSupabaseClient()
  if (!db) throw new Error('Supabase service credentials are not configured')
  const identity = await db.from('market_assets').select('alpaca_id,source_as_of').eq('symbol',symbol).limit(1).maybeSingle()
  if (identity.error) throw new Error(`Unable to resolve feedback issuer: ${identity.error.message}`)
  if (!identity.data?.alpaca_id || !identity.data.source_as_of || Date.parse(identity.data.source_as_of) > Date.parse(cutoff)) return {cutoff,records:[],coverage:'Feedback blocked: no eligible stable security identity. Symbol matches alone cannot attach historical outcomes.'}
  const securityId = String(identity.data.alpaca_id)
  // Join by issuer's symbol rather than the latest advice versions: a newly
  // resolved one-year forecast must reach research even when its issue is old.
  const query = () => db.from('recommendation_evaluations').select('id,recommendation_id,kind,horizon,as_of,content,recommendation_versions!inner(symbol,security_id,issued_at)')
    .eq('owner_id', ownerId).eq('recommendation_versions.symbol',symbol).eq('recommendation_versions.security_id',securityId).lte('recommendation_versions.issued_at',cutoff).lte('as_of',cutoff).order('created_at',{ascending:false})
  const [economic, descriptive] = await Promise.all([query().eq('kind','thesis').limit(40),query().in('kind',['aging','attribution']).limit(20)])
  for (const result of [economic,descriptive]) if (result.error) throw new Error(`Unable to retrieve outcome feedback: ${result.error.message}`)
  const evaluations = {data:[...(economic.data ?? []),...(descriptive.data ?? [])]}
  // Keep the latest append-only assessment for each underlying question, then
  // preserve earlier contrary revisions in the record's original content.
  const seen = new Set<string>()
  const records: ResearchFeedback['records'] = []
  for (const e of evaluations.data ?? []) {
    const content = e.content as Record<string, unknown>
    const key = typeof content.forecastId === 'string' ? content.forecastId : `${e.recommendation_id}:${e.kind}:${e.horizon}`
    if (seen.has(key)) continue
    seen.add(key)
    records.push({id: e.id, kind: e.kind, asOf: e.as_of, content})
    if (records.length === 12) break
  }
  for (const table of ['equity_research_notes', 'etf_research_notes']) {
    const errors = await db.from(table).select('id,error,generated_at').eq('owner_id', ownerId).eq('symbol', symbol)
      .eq('status', 'failed').lte('generated_at', cutoff).order('generated_at', { ascending: false }).limit(2)
    if (errors.error) throw new Error(`Unable to retrieve research failures: ${errors.error.message}`)
    for (const e of errors.data ?? []) records.push({id: e.id, kind: 'operational_research_failure', asOf: e.generated_at, content: {error: e.error, attribution: 'Coverage failure; no ground-truth label about the investment conclusion'}})
  }
  return {cutoff, coverage: 'Latest 40 economic and 20 price/exposure assessments for the matched stable security across all issue dates; at most 12 supplied measured assessments and four operational failures. Economic resolutions have priority; records outside these windows are not claimed as reviewed.', records}
}
export function feedbackSources(feedback: ResearchFeedback): CompanyPacketSource[] {
  return feedback.records.map(r => ({id: `feedback:${r.id}`, label: `${r.kind} recorded ${r.asOf}`, url: 'https://stratum.aarushagarwal.dev/markets/recommendations', source: 'Stratum recorded outcome; attribution remains explicit', asOf: r.asOf}))
}
