import type { Forecast } from './recommendations.ts'
/** Correlation follows the underlying observation, not advice versions,
 * portfolios, probabilities, thresholds or reporting deadlines. */
export function economicEpisodeKey(securityId: string, forecast: Pick<Forecast, 'metric' | 'observationPeriod' | 'unit'>): string | null {
  if (!forecast.metric || !forecast.observationPeriod || !forecast.unit || (!forecast.metric.startsWith('FRED:') && (!securityId || ['undefined','null'].includes(securityId)))) return null
  return JSON.stringify([forecast.metric.startsWith('FRED:') ? 'macro-series' : securityId, forecast.metric, forecast.observationPeriod, forecast.unit])
}
export function forecastCorrelationGroup(securityId: string, metric: string): string {
  return metric.startsWith('FRED:') ? 'macro:shared-environment' : `issuer:${securityId}`
}
