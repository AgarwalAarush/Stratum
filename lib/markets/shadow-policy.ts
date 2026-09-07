import type { Recommendation } from './recommendations.ts'

/** Finite, versioned alternatives. None changes capital actions or owner theses. */
export const SHADOW_POLICIES = {
  'forecast-shrink-20-v1': {
    label: 'Forecasts 20% closer to 50%',
    shrinkage: 0.2,
    metric: 'brier',
  },
  'forecast-shrink-40-v1': {
    label: 'Forecasts 40% closer to 50%',
    shrinkage: 0.4,
    metric: 'brier',
  },
} as const
export type ShadowPolicyKey = keyof typeof SHADOW_POLICIES
export function shadowPolicy(key: string) {
  if (!Object.hasOwn(SHADOW_POLICIES, key))
    throw new Error('Choose an implemented shadow policy')
  return SHADOW_POLICIES[key as ShadowPolicyKey]
}
export function applyShadowPolicy(
  key: string,
  recommendations: Recommendation[],
): Recommendation[] {
  const policy = shadowPolicy(key)
  return recommendations.map((r) => ({
    ...r,
    forecasts: r.forecasts.map((f) => ({
      ...f,
      probability: 0.5 + (f.probability - 0.5) * (1 - policy.shrinkage),
    })),
  }))
}
export type ShadowForecastPair = {
  question: string
  securityId: string
  issuedAt: string
  deadline: string
  baselineProbability: number
  candidateProbability: number
  outcome: boolean | null
  evaluationId: string | null
}
/** One first-issued forecast per economic question, then purge overlapping
 * horizons per security. Unknown outcomes stay in the denominator as unresolved. */
export function evaluateShadowCalibration(
  pairs: ShadowForecastPair[],
  embargoDays: number,
) {
  const seen = new Set<string>(),
    availableAfter = new Map<string, number>()
  const retained: ShadowForecastPair[] = []
  let repeated = 0,
    overlapping = 0
  for (const pair of [...pairs].sort(
    (a, b) =>
      a.issuedAt.localeCompare(b.issuedAt) ||
      a.question.localeCompare(b.question),
  )) {
    if (seen.has(pair.question)) {
      repeated++
      continue
    }
    seen.add(pair.question)
    if (
      Date.parse(pair.issuedAt) < (availableAfter.get(pair.securityId) ?? 0)
    ) {
      overlapping++
      continue
    }
    availableAfter.set(
      pair.securityId,
      Date.parse(pair.deadline) + embargoDays * 86400000,
    )
    retained.push(pair)
  }
  const resolved = retained.filter((p) => typeof p.outcome === 'boolean')
  const loss = (p: ShadowForecastPair, candidate: boolean) =>
    ((candidate ? p.candidateProbability : p.baselineProbability) -
      Number(p.outcome)) **
    2
  const baseline = resolved.length
    ? resolved.reduce((sum, p) => sum + loss(p, false), 0) / resolved.length
    : null
  const candidate = resolved.length
    ? resolved.reduce((sum, p) => sum + loss(p, true), 0) / resolved.length
    : null
  return {
    captured: pairs.length,
    questions: seen.size,
    independentEpisodes: retained.length,
    resolvedEpisodes: resolved.length,
    unresolvedEpisodes: retained.length - resolved.length,
    repeated,
    overlapping,
    baselineBrier: baseline,
    candidateBrier: candidate,
    improvement:
      baseline === null || candidate === null ? null : baseline - candidate,
    retained,
    authority:
      'Descriptive prospective shadow evidence only. No automatic policy promotion or orders.',
    limitations: [
      'Cross-security macro correlations remain; review uncertainty and multiple trials before promotion.',
      'Unresolved economic claims are not scored as wins or losses.',
      'Price performance is not an economic forecast outcome.',
    ],
  }
}
