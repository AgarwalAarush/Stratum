import type {
  CapitalConstraintAssessment,
  CapitalConstraintCheck,
  CapitalConstraintStatus,
  CapitalDecisionSizingInputs,
  PortfolioAccountSummary,
  ThesisDecision,
} from './types.ts'

export interface CapitalDecisionDraft {
  disposition: ThesisDecision['disposition']
  entryAction: ThesisDecision['entryAction']
  fairValue: number | null
  entryZoneLow: number | null
  entryZoneHigh: number | null
  conviction: number | null
  nextCatalyst: string | null
  killCriteria: ThesisDecision['killCriteria']
  valuationSupport: string
  sizingInputs: CapitalDecisionSizingInputs | null
}

interface CapitalConstraintInput {
  symbol: string
  disposition: ThesisDecision['disposition']
  portfolio: PortfolioAccountSummary
  allPortfolios: PortfolioAccountSummary[]
  sizingInputs: CapitalDecisionSizingInputs | null
  classificationBySymbol: ReadonlyMap<string, string>
  currentPrice: number | null
  currentVolume: number | null
  dataAsOf: string
}

function check(
  id: CapitalConstraintCheck['id'],
  status: CapitalConstraintCheck['status'],
  label: string,
  summary: string,
  observedValue: number | null,
  limitValue: number | null,
  unit: CapitalConstraintCheck['unit'],
): CapitalConstraintCheck {
  return { id, status, label, summary, observedValue, limitValue, unit }
}

function assessmentStatus(checks: CapitalConstraintCheck[], missingInputs: boolean): CapitalConstraintStatus {
  if (missingInputs) return 'needs_inputs'
  if (checks.some((item) => item.status === 'blocked')) return 'blocked'
  if (checks.some((item) => item.status === 'warning' || item.status === 'unknown')) return 'warning'
  return 'pass'
}

/**
 * Deterministic review checks around owner-supplied sizing inputs. This never
 * recommends a target weight, places an order, or mutates a portfolio.
 */
export function evaluateCapitalConstraints(input: CapitalConstraintInput): Omit<CapitalConstraintAssessment, 'id' | 'decisionId' | 'evaluatedAt'> {
  const ownIntent = input.disposition === 'own'
  const sizing = input.sizingInputs
  const totalValue = input.portfolio.totalValue
  const currentHolding = input.portfolio.holdings.find((holding) => holding.symbol === input.symbol)
  const currentValue = currentHolding?.currentValue ?? null
  const otherAccountCount = input.allPortfolios.filter((portfolio) => (
    portfolio.account.id !== input.portfolio.account.id
    && portfolio.holdings.some((holding) => holding.symbol === input.symbol && holding.quantity > 0)
  )).length

  const checks: CapitalConstraintCheck[] = []
  const missingInputs = ownIntent && (!sizing || totalValue === null || totalValue <= 0)

  if (!ownIntent) {
    checks.push(check('concentration', 'pass', 'Position concentration', 'Watch and avoid decisions do not request portfolio sizing.', null, null, 'percent'))
    checks.push(check('correlated_exposure', 'pass', 'Correlated exposure', 'No additional correlated exposure is proposed.', null, null, 'percent'))
    checks.push(check('liquidity', 'pass', 'Liquidity', 'No position size is proposed.', null, null, 'days'))
    checks.push(check('cash_impact', 'pass', 'Cash impact', 'No portfolio cash is allocated by this decision.', 0, null, 'usd'))
  } else if (!sizing || totalValue === null || totalValue <= 0) {
    const message = !sizing
      ? 'Owner-supplied sizing limits are required before an own decision can be evaluated.'
      : 'A complete account value is required before percentage constraints can be evaluated.'
    checks.push(check('concentration', 'unknown', 'Position concentration', message, null, sizing?.maxPositionWeightPct ?? null, 'percent'))
    checks.push(check('correlated_exposure', 'unknown', 'Correlated exposure', message, null, sizing?.maxCorrelatedWeightPct ?? null, 'percent'))
    checks.push(check('liquidity', 'unknown', 'Liquidity', message, null, sizing?.maxLiquidityDays ?? null, 'days'))
    checks.push(check('cash_impact', 'unknown', 'Cash impact', message, null, null, 'usd'))
  } else {
    const targetValue = totalValue * sizing.targetWeightPct / 100
    const incrementalCash = Math.max(0, targetValue - (currentValue ?? 0))
    checks.push(check(
      'concentration',
      sizing.targetWeightPct > sizing.maxPositionWeightPct ? 'blocked' : sizing.targetWeightPct > sizing.maxPositionWeightPct * 0.8 ? 'warning' : 'pass',
      'Position concentration',
      `${sizing.targetWeightPct.toFixed(1)}% owner target versus a ${sizing.maxPositionWeightPct.toFixed(1)}% owner ceiling.`,
      sizing.targetWeightPct,
      sizing.maxPositionWeightPct,
      'percent',
    ))

    const normalizedGroup = sizing.correlationGroup.trim().toLocaleLowerCase()
    const correlatedCurrentValue = input.portfolio.holdings.reduce((total, holding) => {
      const classification = input.classificationBySymbol.get(holding.symbol)?.trim().toLocaleLowerCase()
      return classification === normalizedGroup ? total + (holding.currentValue ?? 0) : total
    }, 0)
    const targetAlreadyInGroup = input.classificationBySymbol.get(input.symbol)?.trim().toLocaleLowerCase() === normalizedGroup
    const proposedCorrelatedValue = correlatedCurrentValue - (targetAlreadyInGroup ? currentValue ?? 0 : 0) + targetValue
    const correlatedWeight = totalValue > 0 ? proposedCorrelatedValue / totalValue * 100 : null
    checks.push(check(
      'correlated_exposure',
      correlatedWeight === null ? 'unknown' : correlatedWeight > sizing.maxCorrelatedWeightPct ? 'blocked' : correlatedWeight > sizing.maxCorrelatedWeightPct * 0.8 ? 'warning' : 'pass',
      'Correlated exposure',
      correlatedWeight === null
        ? `The ${sizing.correlationGroup} group cannot be calculated from the current account snapshot.`
        : `${sizing.correlationGroup} would represent ${correlatedWeight.toFixed(1)}% versus a ${sizing.maxCorrelatedWeightPct.toFixed(1)}% owner ceiling.`,
      correlatedWeight,
      sizing.maxCorrelatedWeightPct,
      'percent',
    ))

    const dailyDollarVolume = input.currentPrice !== null && input.currentVolume !== null
      ? input.currentPrice * input.currentVolume
      : null
    const estimatedExitDays = dailyDollarVolume && dailyDollarVolume > 0 ? targetValue / (dailyDollarVolume * 0.1) : null
    checks.push(check(
      'liquidity',
      estimatedExitDays === null ? 'unknown' : estimatedExitDays > sizing.maxLiquidityDays ? 'blocked' : estimatedExitDays > sizing.maxLiquidityDays * 0.8 ? 'warning' : 'pass',
      'Liquidity',
      estimatedExitDays === null
        ? 'Current price and session volume are insufficient for a deterministic liquidity estimate.'
        : `At 10% of current-session dollar volume, the owner target would take about ${estimatedExitDays.toFixed(2)} days to exit.`,
      estimatedExitDays,
      sizing.maxLiquidityDays,
      'days',
    ))

    checks.push(check(
      'cash_impact',
      incrementalCash > input.portfolio.cashBalance ? 'blocked' : incrementalCash > input.portfolio.cashBalance * 0.8 ? 'warning' : 'pass',
      'Cash impact',
      `${incrementalCash.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })} incremental cash versus ${input.portfolio.cashBalance.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })} available.`,
      incrementalCash,
      input.portfolio.cashBalance,
      'usd',
    ))
  }

  checks.push(check(
    'account_separation',
    otherAccountCount > 0 ? 'warning' : 'pass',
    'Account separation',
    otherAccountCount > 0
      ? `${input.symbol} is also held in ${otherAccountCount} other portfolio${otherAccountCount === 1 ? '' : 's'}; this decision applies only to ${input.portfolio.account.name}.`
      : `This decision applies only to ${input.portfolio.account.name}; no same-symbol holding was found in another account.`,
    otherAccountCount,
    0,
    'count',
  ))

  return {
    portfolioId: input.portfolio.account.id,
    status: assessmentStatus(checks, missingInputs),
    checks,
    inputs: sizing,
    dataAsOf: input.dataAsOf,
  }
}

export function buildCapitalDecisionChangeSummary(prior: ThesisDecision | null, next: CapitalDecisionDraft): string[] {
  if (!prior) return ['Initial capital decision recorded.']
  const changes: string[] = []
  if (prior.disposition !== next.disposition) changes.push(`Disposition changed from ${prior.disposition} to ${next.disposition}.`)
  if (prior.entryAction !== next.entryAction) changes.push(`Entry action changed from ${prior.entryAction.replaceAll('_', ' ')} to ${next.entryAction.replaceAll('_', ' ')}.`)
  if (prior.fairValue !== next.fairValue) changes.push(`Fair value changed from ${prior.fairValue ?? 'not set'} to ${next.fairValue ?? 'not set'}.`)
  if (prior.entryZoneLow !== next.entryZoneLow || prior.entryZoneHigh !== next.entryZoneHigh) changes.push('Entry zone changed.')
  if (prior.conviction !== next.conviction) changes.push(`Conviction changed from ${prior.conviction ?? 'not set'} to ${next.conviction ?? 'not set'}.`)
  if (prior.nextCatalyst !== next.nextCatalyst) changes.push('Next catalyst changed.')
  if (JSON.stringify(prior.killCriteria) !== JSON.stringify(next.killCriteria)) changes.push('Kill criteria changed.')
  if (prior.valuationSupport !== next.valuationSupport) changes.push('Valuation support changed.')
  if (JSON.stringify(prior.sizingInputs) !== JSON.stringify(next.sizingInputs)) changes.push('Owner-supplied sizing inputs changed.')
  return changes.length > 0 ? changes : ['Decision reviewed with no structured field change.']
}

export function decisionReviewDue(decision: Pick<ThesisDecision, 'createdAt'>, latestReviewAt: string | null, now = new Date(), cadenceDays = 90): boolean {
  const decisionAt = Date.parse(decision.createdAt)
  if (!Number.isFinite(decisionAt)) return false
  const reviewAt = latestReviewAt ? Date.parse(latestReviewAt) : Number.NaN
  const lastReview = Number.isFinite(reviewAt) ? Math.max(decisionAt, reviewAt) : decisionAt
  return now.getTime() - lastReview >= cadenceDays * 86_400_000
}
