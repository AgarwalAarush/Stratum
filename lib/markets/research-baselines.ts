import { COMPANY_FORECAST_METRICS } from './forecast-metrics.ts'
import type { CompanyPacket, EtfResearchPacket } from './types.ts'
import type { Forecast } from './recommendations.ts'

/** Deliberately simple comparison, not a claimed investment model. Historical
 * exact reported values with matching units; Laplace smoothing. No LLM calls. */
export function evidenceOnlyProbability(packet: CompanyPacket | EtfResearchPacket, question: Pick<Forecast,'metric'|'unit'|'threshold'|'operator'|'observationPeriod'>) {
  if (!('company' in packet) || !Object.hasOwn(COMPANY_FORECAST_METRICS, question.metric)) return {probability: null, reason: 'No supported exact-metric historical baseline'}
  const [statement, field] = COMPANY_FORECAST_METRICS[question.metric as keyof typeof COMPANY_FORECAST_METRICS]
  const rows = packet.financialStatements?.[statement] ?? []
  const seen = new Set<string>()
  const values = rows.filter(r => typeof r.date === 'string' && r.date < (question.observationPeriod ?? '') && r.reportedCurrency === question.unit && typeof r[field] === 'number' && Number.isFinite(r[field]) && !seen.has(r.date) && Boolean(seen.add(r.date))).map(r => r[field] as number)
  if (values.length < 2) return {probability: null, reason: 'Fewer than two comparable historical observations'}
  const hits = values.filter(v => question.operator === 'gt' ? v > question.threshold : v < question.threshold).length
  return {probability: (hits + 1) / (values.length + 2), reason: `Evidence-only Laplace-smoothed threshold frequency: ${hits}/${values.length} prior periods. No growth, seasonality or causal inference.`}
}
