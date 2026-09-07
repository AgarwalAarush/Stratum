import type { Forecast, Recommendation } from './recommendations.ts'

export const FORECAST_REVIEW_POLICY = 'reviewed-forecasts-v2'

/** A blocked decision has not earned forecast approval, even when its original
 * immutable content contains probabilities. Do not infer approval from a later
 * price move, owner override, or a successful publication. Unblocked watch and
 * no-trade decisions may still contain valid economic forecasts. */
export function forecastsAreApproved(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const rec = value as Partial<Recommendation>
  return Array.isArray(rec.forecasts) &&
    (!Array.isArray(rec.gateReasons) || rec.gateReasons.length === 0)
}

export function reviewedForecasts(rec: Recommendation): Recommendation {
  return forecastsAreApproved(rec) ? rec : { ...rec, forecasts: [] }
}

/** Legacy forecasts lack a typed metric registry. Identify explicit security
 * price/return metrics conservatively; FRED prices and operating return ratios
 * are economic observations, not investment markouts. */
export function forecastCategory(forecast: Pick<Forecast, 'metric'>): 'market_return' | 'economic' {
  const metric = forecast.metric.toLowerCase()
  if (metric.startsWith('fred:')) return 'economic'
  return /\b(?:price|total|stock|share|fund|etf|security)\s+(?:price\s+)?returns?\b|\b(?:stock|share|fund|etf|security)\s+price\b|\bprice\s+(?:change|appreciation|target)\b/.test(metric)
    ? 'market_return' : 'economic'
}
