import type { MarketThesisExposure } from './types.ts'

export interface ControlledExposureResearchCandidate {
  exposureId: string
  symbol: string
  materiality: number
  confidence: number
}

/** The automatic lane is intentionally narrow: a source-attributed analyst
 * candidate, a verified active/tradable symbol, and high materiality are all
 * required. It queues independent research only; manual review remains
 * available for lower-scored candidates. */
export function selectControlledExposureResearch(
  exposures: readonly MarketThesisExposure[],
  options: { limit?: number; minimumMateriality?: number; minimumConfidence?: number } = {},
): ControlledExposureResearchCandidate[] {
  const limit = Math.max(1, Math.min(options.limit ?? 2, 4))
  const minimumMateriality = options.minimumMateriality ?? 70
  const minimumConfidence = options.minimumConfidence ?? 60
  return exposures
    .filter((exposure) => exposure.symbol
      && exposure.verificationStatus === 'needs_company_research'
      && exposure.resolutionMethod === 'analyst_source_candidate'
      && exposure.sourceIds.length > 0
      && !exposure.researchQueuedAt
      && exposure.materiality >= minimumMateriality
      && exposure.confidence >= minimumConfidence)
    .sort((left, right) => right.materiality - left.materiality || right.confidence - left.confidence || (left.symbol ?? '').localeCompare(right.symbol ?? ''))
    .slice(0, limit)
    .map((exposure) => ({ exposureId: exposure.id, symbol: exposure.symbol!, materiality: exposure.materiality, confidence: exposure.confidence }))
}
