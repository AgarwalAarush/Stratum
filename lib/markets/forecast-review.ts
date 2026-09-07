import type { Recommendation } from './recommendations.ts'

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
