import type { MarketLeadershipSnapshot, MarketOverviewResponse } from './types.ts'

export interface MarketBriefLine {
  label: 'Leadership' | 'Weakness' | 'Watch'
  text: string
  href: string | null
}

export interface MarketDailyBrief {
  summary: string
  lines: MarketBriefLine[]
}

function signedPercent(value: number | null | undefined): string | null {
  return typeof value === 'number' && Number.isFinite(value)
    ? `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`
    : null
}

function strongestGroup(leadership: MarketLeadershipSnapshot, direction: 'up' | 'down') {
  return [...leadership.sectors, ...leadership.subIndustries]
    .filter((group) => group.dayReturn !== null && (direction === 'up' ? group.dayReturn >= 0 : group.dayReturn < 0))
    .sort((left, right) => direction === 'up'
      ? (right.dayReturn ?? 0) - (left.dayReturn ?? 0)
      : (left.dayReturn ?? 0) - (right.dayReturn ?? 0))[0] ?? null
}

function groupHref(group: NonNullable<ReturnType<typeof strongestGroup>>) {
  const view = group.groupType === 'sector' ? 'sectors' : 'sub-industries'
  return `/markets/explore?view=${view}&group=${encodeURIComponent(group.label)}`
}

/**
 * Turns an otherwise dense MarketMemo into a three-line daily read. The brief
 * deliberately keeps breadth and feed diagnostics out of the primary story;
 * they remain available in the underlying market data rather than competing
 * with the actual leadership, weakness, and risk callouts.
 */
export function buildMarketDailyBrief(overview: MarketOverviewResponse): MarketDailyBrief {
  const leadership = overview.leadership
  const summary = overview.memo.sectorImplications[0]?.text
    ?? overview.memo.changes[1]?.body
    ?? `The current market state is ${overview.state.regime.toLowerCase()}.`

  if (!leadership) {
    return {
      summary,
      lines: [
        { label: 'Leadership', text: overview.memo.changes[2]?.body ?? 'Leadership data is not available in this snapshot.', href: '/markets/explore?view=stocks' },
        { label: 'Weakness', text: overview.memo.risks[0] ?? 'No downside concentration is available in this snapshot.', href: '/markets/explore?view=stocks' },
        { label: 'Watch', text: overview.memo.watchItems[0] ?? overview.memo.catalysts[0] ?? 'Awaiting the next market snapshot.', href: '/markets/events' },
      ],
    }
  }

  const leadingGroup = strongestGroup(leadership, 'up')
  const weakGroup = strongestGroup(leadership, 'down')
  const leadingStock = leadership.leaders[0]
  const weakStock = leadership.laggards[0]
  const divergence = leadership.divergences[0]

  const leadershipText = leadingGroup
    ? `${leadingGroup.label} leads at ${signedPercent(leadingGroup.dayReturn)}${leadingStock ? `; ${leadingStock.symbol} ${signedPercent(leadingStock.dayReturn)} is the strongest tracked name.` : '.'}`
    : leadingStock
      ? `${leadingStock.symbol} leads the tracked market at ${signedPercent(leadingStock.dayReturn)}.`
      : overview.memo.changes[2]?.body ?? 'Leadership is not available in this snapshot.'

  const weaknessText = weakGroup
    ? `${weakGroup.label} is the weakest group at ${signedPercent(weakGroup.dayReturn)}${weakStock ? `; ${weakStock.symbol} ${signedPercent(weakStock.dayReturn)} is under the most pressure.` : '.'}`
    : weakStock
      ? `${weakStock.symbol} is the weakest tracked name at ${signedPercent(weakStock.dayReturn)}.`
      : overview.memo.risks[0] ?? 'No concentrated weakness is available in this snapshot.'

  return {
    summary,
    lines: [
      { label: 'Leadership', text: leadershipText, href: leadingGroup ? groupHref(leadingGroup) : leadingStock ? `/markets/stocks/${leadingStock.symbol}` : '/markets/explore?view=stocks' },
      { label: 'Weakness', text: weaknessText, href: weakGroup ? groupHref(weakGroup) : weakStock ? `/markets/stocks/${weakStock.symbol}` : '/markets/explore?view=stocks' },
      { label: 'Watch', text: divergence?.summary ?? overview.memo.watchItems[0] ?? overview.memo.catalysts[0] ?? 'Awaiting the next market snapshot.', href: divergence ? `/markets/explore?view=sub-industries&group=${encodeURIComponent(divergence.groupLabel)}` : '/markets/events' },
    ],
  }
}
