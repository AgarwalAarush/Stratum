import type { MarketDomainPack, MarketResearchFrontierItem, WorldObservationProposal, WorldSourceDiscoveryRun, WorldSourceEvidenceClass, WorldSourceRegistryEntry } from './types.ts'

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

/** Retain the frontier-to-source path even when a later scout finds the same
 * canonical candidate. Candidate status remains non-authoritative. */
export function candidateResearchFrontiers(
  source: WorldSourceRegistryEntry,
  discoveryRuns: WorldSourceDiscoveryRun[],
  frontiers: MarketResearchFrontierItem[],
): MarketResearchFrontierItem[] {
  const frontierIds = new Set(discoveryRuns
    .filter((run) => run.trigger === 'frontier_gap' && run.candidates.some((candidate) => candidate.slug === source.slug))
    .flatMap((run) => run.frontierIds))
  return frontiers
    .filter((frontier) => frontierIds.has(frontier.id))
    .sort((left, right) => right.priority - left.priority || left.causalNode.localeCompare(right.causalNode))
}

export interface PrioritizedWorldObservationProposal {
  proposal: WorldObservationProposal
  /** Open bounded questions whose causal node is directly addressed by the quote. */
  advancesFrontiers: MarketResearchFrontierItem[]
}

/**
 * This does not accept evidence or infer that a quote resolves a question. It
 * makes the scarce human review pass deterministic: unreviewed, high-materiality
 * quotes that bear on an open causal node are shown first.
 */
export function prioritizeWorldObservationProposals(
  proposals: WorldObservationProposal[],
  frontiers: MarketResearchFrontierItem[],
  domainId?: string,
): PrioritizedWorldObservationProposal[] {
  const openFrontiers = frontiers.filter((frontier) => frontier.status === 'queued' || frontier.status === 'deferred' || frontier.status === 'evidence_received')
  return proposals
    .filter((proposal) => !domainId || proposal.domainId === domainId)
    .map((proposal) => ({
      proposal,
      advancesFrontiers: openFrontiers
        .filter((frontier) => frontier.causalNode === proposal.mechanism)
        .sort((left, right) => right.priority - left.priority || left.question.localeCompare(right.question)),
    }))
    .sort((left, right) => {
      const reviewDifference = Number(Boolean(left.proposal.review)) - Number(Boolean(right.proposal.review))
      if (reviewDifference !== 0) return reviewDifference
      const frontierDifference = (right.advancesFrontiers[0]?.priority ?? 0) - (left.advancesFrontiers[0]?.priority ?? 0)
      if (frontierDifference !== 0) return frontierDifference
      const materialityDifference = right.proposal.materiality - left.proposal.materiality
      if (materialityDifference !== 0) return materialityDifference
      const confidenceDifference = right.proposal.confidence - left.proposal.confidence
      if (confidenceDifference !== 0) return confidenceDifference
      const noveltyDifference = right.proposal.novelty - left.proposal.novelty
      if (noveltyDifference !== 0) return noveltyDifference
      const timeDifference = Date.parse(right.proposal.generatedAt) - Date.parse(left.proposal.generatedAt)
      if (Number.isFinite(timeDifference) && timeDifference !== 0) return timeDifference
      return left.proposal.id.localeCompare(right.proposal.id)
    })
}
