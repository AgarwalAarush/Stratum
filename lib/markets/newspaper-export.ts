import type { PortfolioAccountSummary } from './types.ts'
import { RECOMMENDATION_ACTIONS } from './recommendations.ts'

export const NEWSPAPER_MAX_AGE_SECONDS = 86_400
type Row = Record<string, unknown>
export type PublishedNewspaperAnalysis = {
  batch: Row
  versions: Row[]
  manifest: Row
}
const row = (value: unknown): Row => value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {}
const text = (value: unknown): string | null => typeof value === 'string' ? value : null
const number = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null
const texts = (value: unknown): string[] => Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
const timestamp = (value: unknown): string | null => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null

export function newspaperFreshness(asOf: string | null, now: Date) {
  const age = asOf === null ? NaN : (now.getTime() - Date.parse(asOf)) / 1_000
  return {
    status: !Number.isFinite(age) || age < 0 ? 'unknown' as const
      : age > NEWSPAPER_MAX_AGE_SECONDS ? 'stale' as const : 'fresh' as const,
    asOf,
    maxAgeSeconds: NEWSPAPER_MAX_AGE_SECONDS,
  }
}

/** Explicit projection: never spread database rows or raw evidence into exports. */
export function newspaperPortfolio(portfolio: PortfolioAccountSummary, now: Date) {
  if (![portfolio.cashBalance, portfolio.investedCost].every(Number.isFinite)) throw new Error('Invalid portfolio totals')
  const dataAsOf = timestamp(portfolio.dataAsOf)
  if (portfolio.dataSource === 'robinhood' && dataAsOf === null) throw new Error('Invalid brokerage capture time')
  const freshness = newspaperFreshness(dataAsOf, now)
  const capitalAsOf = timestamp(portfolio.capitalAsOf) ?? dataAsOf
  const capitalFreshness = newspaperFreshness(capitalAsOf, now)
  const flags: string[] = []
  if (freshness.status !== 'fresh') flags.push(`holdings_${freshness.status}`)
  if (capitalFreshness.status !== 'fresh') flags.push(`capital_${capitalFreshness.status}`)
  if (portfolio.dataSource === 'ledger') flags.push('ledger_fallback')
  if (portfolio.dataSource === 'manual_snapshot' && dataAsOf === null) flags.push('manual_capture_invalidated')
  const holdings = portfolio.holdings.map(holding => {
    if (!/^[A-Z][A-Z0-9.-]{0,11}$/.test(holding.symbol)
      || ![holding.quantity, holding.costBasisPerShare, holding.totalCost].every(Number.isFinite)
      || holding.quantity <= 0 || holding.costBasisPerShare < 0 || holding.totalCost < 0) throw new Error('Invalid holding')
    const quoteAsOf = timestamp(holding.quoteAsOf)
    const quoteSource = holding.quoteSource === 'robinhood' ? 'robinhood' : null
    const quoteFreshness = newspaperFreshness(quoteAsOf, now)
    // A number alone is insufficient price evidence. Never relabel capture time
    // as quote time or use UI / illustrative / unproven fallback prices.
    const currentPrice = quoteAsOf && quoteSource && (number(holding.currentPrice) ?? -1) > 0 ? number(holding.currentPrice) : null
    const currentValue = currentPrice === null ? null : currentPrice * holding.quantity
    const holdingFlags = currentPrice === null ? ['quote_unavailable']
      : quoteFreshness.status === 'fresh' ? [] : [`quote_${quoteFreshness.status}`]
    if (holdingFlags.length) flags.push('holding_quotes_incomplete_or_stale')
    return {
      symbol: holding.symbol, quantity: holding.quantity,
      costBasisPerShare: holding.costBasisPerShare, totalCost: holding.totalCost,
      currentPrice, currentValue,
      unrealizedPnl: currentValue === null ? null : currentValue - holding.totalCost,
      quoteAsOf, quoteSource, freshness: quoteFreshness,
      readiness: { ready: holdingFlags.length === 0, flags: holdingFlags },
    }
  })
  const budget = portfolio.allocationBudget
  if (budget) flags.push('owner_allocation_budget_not_broker_cash')
  const deduplicated = [...new Set(flags)]
  return {
    id: portfolio.account.id, name: portfolio.account.name, kind: portfolio.account.kind,
    dataSource: portfolio.dataSource, dataAsOf,
    confirmedAt: timestamp(portfolio.confirmedAt), capitalAsOf,
    capitalBasis: budget ? 'owner_budget' as const : portfolio.dataSource === 'robinhood' ? 'broker_cash' as const
      : portfolio.dataSource === 'ledger' ? 'ledger_cash' as const : 'owner_reported_cash' as const,
    cashBalance: budget ? null : portfolio.cashBalance,
    availableAllocation: budget ? portfolio.cashBalance : null,
    allocationBudget: budget ? { total: number(budget.total), holdingsValue: number(budget.holdingsValue) } : null,
    investedCost: portfolio.investedCost,
    marketValue: number(portfolio.marketValue), totalValue: number(portfolio.totalValue),
    unrealizedPnl: number(portfolio.unrealizedPnl),
    holdings, freshness, capitalFreshness,
    readiness: { ready: deduplicated.length === 0, flags: deduplicated },
  }
}

function publicSourceUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password
      || [...url.searchParams.keys()].some(key => /token|secret|password|api.?key|signature|credential/i.test(key))) return null
    return url.toString()
  } catch { return null }
}

export function newspaperAnalysis(input: PublishedNewspaperAnalysis | null, now: Date, readFailed = false) {
  if (!input) return {
    status: 'unavailable' as const, edition: null, recommendations: [], sources: [],
    freshness: newspaperFreshness(null, now),
    readiness: { ready: false, flags: [readFailed ? 'read_failed' : 'no_published_edition'] },
  }
  const { batch, manifest } = input
  const publishedAt = timestamp(batch.published_at)
  if (!publishedAt || !text(batch.id) || !timestamp(manifest.cutoff)) throw new Error('Invalid published edition')
  const sources = (Array.isArray(manifest.evidence) ? manifest.evidence : []).map(value => {
    const source = row(value)
    return { id: text(source.id), url: publicSourceUrl(source.url), asOf: timestamp(source.asOf),
      availableAt: timestamp(source.availableAt), retrievedAt: timestamp(source.retrievedAt), feed: text(source.feed) }
  })
  const sourceIds = new Set(sources.map(source => source.id))
  const recommendations = input.versions.map(version => {
    const content = row(version.content), entry = row(content.entry), dimensions = row(content.dimensions)
    if (!text(version.id) || !text(content.symbol) || !text(content.portfolioId)
      || !RECOMMENDATION_ACTIONS.includes(content.action as typeof RECOMMENDATION_ACTIONS[number])
      || !text(content.reason)) throw new Error('Invalid published recommendation')
    const expiresAt = timestamp(content.expiresAt)
    return {
      id: text(version.id), symbol: text(content.symbol), portfolioId: text(content.portfolioId), action: text(content.action),
      reason: text(content.reason), thesis: text(content.thesis), counterThesis: text(content.counterThesis),
      mechanism: text(content.mechanism), expectations: text(content.expectations),
      horizonDays: number(content.horizonDays), expiresAt,
      risks: texts(content.risks), invalidation: texts(content.invalidation), confidence: number(content.confidence),
      entry: { trigger: text(entry.trigger), condition: text(entry.condition), maxPrice: number(entry.maxPrice), targetWeightPct: number(entry.targetWeightPct) },
      exit: text(content.exit), reassessWhen: text(content.reassessWhen), sourceIds: texts(content.sourceIds),
      dimensions: { thesisQuality: text(dimensions.thesisQuality), valuation: text(dimensions.valuation), timing: text(dimensions.timing), portfolioFit: text(dimensions.portfolioFit) },
      alternative: text(content.alternative), gateReasons: texts(content.gateReasons),
      expired: expiresAt === null ? null : Date.parse(expiresAt) <= now.getTime(),
    }
  })
  const dataAsOf = timestamp(manifest.cutoff), freshness = newspaperFreshness(dataAsOf, now)
  const gaps = texts(manifest.gaps), flags: string[] = []
  if (freshness.status !== 'fresh') flags.push(`analysis_${freshness.status}`)
  if (gaps.length) flags.push('published_evidence_gaps')
  if (!recommendations.length) flags.push('no_published_recommendations')
  if (recommendations.some(item => item.expired !== false)) flags.push('recommendations_expired_or_undated')
  if (recommendations.some(item => item.sourceIds.some(id => !sourceIds.has(id)))) flags.push('missing_source_references')
  if (sources.some(source => source.id === null || source.url === null)) flags.push('source_links_incomplete')
  return {
    status: 'published' as const,
    edition: { id: text(batch.id), decisionDate: text(batch.decision_date), publishedAt, summary: text(batch.summary), dataAsOf, policy: text(manifest.policy), gaps },
    recommendations, sources, freshness,
    readiness: { ready: flags.length === 0, flags },
  }
}

export type NewspaperExport = {
  schemaVersion: 1
  exportedAt: string
  privacy: 'private-owner-only'
  portfolios: ReturnType<typeof newspaperPortfolio>[]
  analysis: ReturnType<typeof newspaperAnalysis>
  readiness: { ready: boolean; flags: string[] }
  errors: Array<{ scope: 'analysis'; code: 'read_failed' }>
}
