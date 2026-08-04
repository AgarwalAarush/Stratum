import type { MarketDomainPack, WorldSourceEvidenceClass, WorldSourceRegistryEntry } from './types.ts'

export interface PrioritizedWorldSourceCandidate {
  source: WorldSourceRegistryEntry
  /** Evidence classes this review could still add to the selected domain. */
  closesCoverageGaps: WorldSourceEvidenceClass[]
}

function isUsableSource(source: WorldSourceRegistryEntry): boolean {
  return source.status === 'approved' || source.status === 'probation'
}

/**
 * Human approval remains the admission gate. This only orders the review queue
 * so a reviewer sees direct candidates that close declared coverage gaps first.
 */
export function prioritizeWorldSourceCandidates(
  sources: WorldSourceRegistryEntry[],
  domain: MarketDomainPack,
): PrioritizedWorldSourceCandidate[] {
  const usableSources = sources.filter((source) => isUsableSource(source) && source.domainIds.includes(domain.id))
  const unmetClasses = new Set(domain.sourceRequirements
    .filter((requirement) => new Set(usableSources.filter((source) => source.evidenceClasses.includes(requirement.evidenceClass)).map((source) => source.id)).size < requirement.minimumSources)
    .map((requirement) => requirement.evidenceClass))

  return sources
    .filter((source) => source.status === 'candidate' && source.domainIds.includes(domain.id))
    .map((source) => ({
      source,
      closesCoverageGaps: source.evidenceClasses.filter((evidenceClass) => unmetClasses.has(evidenceClass)),
    }))
    .sort((left, right) => {
      const gapDifference = right.closesCoverageGaps.length - left.closesCoverageGaps.length
      if (gapDifference !== 0) return gapDifference
      const deterministicDifference = (right.source.candidateContext?.deterministicScore ?? -1) - (left.source.candidateContext?.deterministicScore ?? -1)
      if (deterministicDifference !== 0) return deterministicDifference
      const scoutDifference = (right.source.candidateContext?.scoutScore ?? -1) - (left.source.candidateContext?.scoutScore ?? -1)
      if (scoutDifference !== 0) return scoutDifference
      return left.source.label.localeCompare(right.source.label)
    })
}
