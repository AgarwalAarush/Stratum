export type LearningRegistration = {
  hypothesis: string
  baselinePolicy: string
  candidatePolicy: string
  startsAt: string
  endsAt: string
  primaryMetric: 'brier' | 'excess_return' | 'drawdown'
  minimumEpisodes: number
  minimumImprovement: number
  maximumDrawdownWorsening: number
  embargoDays: number
  trialNumber: number
}
export function validateLearningRegistration(
  input: LearningRegistration,
  now = new Date(),
): LearningRegistration {
  if (
    !input.hypothesis ||
    input.hypothesis.length < 20 ||
    !input.baselinePolicy ||
    !input.candidatePolicy ||
    input.baselinePolicy === input.candidatePolicy
  )
    throw new Error(
      'A distinct candidate, baseline and falsifiable hypothesis are required',
    )
  if (
    !Number.isFinite(Date.parse(input.endsAt)) ||
    !Number.isFinite(Date.parse(input.startsAt)) ||
    Date.parse(input.startsAt) < now.getTime() ||
    Date.parse(input.endsAt) - Date.parse(input.startsAt) < 30 * 86400000
  )
    throw new Error('Register a future prospective window of at least 30 days')
  if (
    !['brier', 'excess_return', 'drawdown'].includes(input.primaryMetric) ||
    !Number.isInteger(input.minimumEpisodes) ||
    input.minimumEpisodes < 30 ||
    !(input.minimumImprovement > 0) ||
    !(input.maximumDrawdownWorsening >= 0) ||
    input.embargoDays < 20 ||
    !Number.isInteger(input.trialNumber) ||
    input.trialNumber < 1
  )
    throw new Error(
      'Predeclare metric, effect, risk tolerance, at least 30 episodes and 20-day embargo',
    )
  return input
}
export function learningPromotionGate(
  registration: LearningRegistration,
  evidence: {
    independentEpisodes: number
    windowComplete: boolean
    outOfSample: boolean
    purgedOverlap: boolean
    baseline: number
    candidate: number
    drawdownWorsening: number
    multipleTestingAdjusted: boolean
    ownerReviewed: boolean
    lowerImprovementBound: number
  },
) {
  const reasons = []
  if (
    [
      evidence.independentEpisodes,
      evidence.baseline,
      evidence.candidate,
      evidence.drawdownWorsening,
      evidence.lowerImprovementBound,
    ].some((n) => !Number.isFinite(n))
  )
    reasons.push('Evaluation statistics are incomplete')
  if (evidence.independentEpisodes < registration.minimumEpisodes)
    reasons.push('Insufficient independent episodes')
  if (
    !evidence.windowComplete ||
    !evidence.outOfSample ||
    !evidence.purgedOverlap
  )
    reasons.push('Prospective window, overlap purge and embargo are incomplete')
  if (!evidence.multipleTestingAdjusted && registration.trialNumber > 1)
    reasons.push('Repeated trials require multiplicity adjustment')
  if (evidence.lowerImprovementBound < registration.minimumImprovement)
    reasons.push('Uncertainty interval does not clear the preregistered effect')
  if (evidence.drawdownWorsening > registration.maximumDrawdownWorsening)
    reasons.push('Risk tolerance exceeded')
  if (!evidence.ownerReviewed) reasons.push('Owner review is required')
  return {
    eligible: reasons.length === 0,
    reasons,
    authority:
      'Policy review only; never order execution or retroactive thesis changes',
  }
}

export function resolveNumericForecast(
  input: {
    operator: 'gt' | 'lt'
    threshold: number
    deadline: string
    issuedAt: string
    metric: string
  },
  observations: Array<{
    id: string
    metric: string
    value: number
    period: string
    availableAt: string
    sourceUrl: string
  }>,
  cutoff: string,
) {
  const eligible = observations
    .filter(
      (o) =>
        o.metric === input.metric &&
        Number.isFinite(o.value) &&
        o.period > input.issuedAt.slice(0, 10) &&
        o.period <= input.deadline.slice(0, 10) &&
        Date.parse(o.availableAt) > Date.parse(input.issuedAt) &&
        Date.parse(o.availableAt) <= Date.parse(cutoff),
    )
    .sort(
      (a, b) =>
        b.period.localeCompare(a.period) ||
        a.availableAt.localeCompare(b.availableAt),
    )
  if (Date.parse(input.deadline) > Date.parse(cutoff))
    return { status: 'not_yet_due' as const, outcome: null, observation: null }
  const observation = eligible[0]
  if (!observation)
    return {
      status: 'expired_without_evidence' as const,
      outcome: null,
      observation: null,
    }
  const outcome =
    input.operator === 'gt'
      ? observation.value > input.threshold
      : observation.value < input.threshold
  return {
    status: outcome ? ('confirmed' as const) : ('disconfirmed' as const),
    outcome,
    observation,
  }
}
