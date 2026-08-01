import type { MarketGroupMetric, MarketLeadershipSnapshot, StockLeadershipMetric } from './types.ts'

export type MarketAttentionTone = 'positive' | 'negative' | 'neutral'

export interface MarketAttentionItem {
  id: string
  eyebrow: string
  title: string
  detail: string
  metric: string
  tone: MarketAttentionTone
  href: string
}

export interface MarketCheckpoint {
  id: string
  label: string
  value: string
  detail: string
  tone: MarketAttentionTone
}

function signedPercent(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`
}

function stockItem(stock: StockLeadershipMetric | undefined, direction: 'leading' | 'falling'): MarketAttentionItem | null {
  if (!stock || stock.dayReturn === null) return null
  const isLeading = direction === 'leading'
  const activity = stock.relativeVolume !== null && stock.relativeVolume > 1
    ? ` · ${stock.relativeVolume.toFixed(1)}× relative volume`
    : ''
  return {
    id: `${direction}-${stock.symbol}`,
    eyebrow: isLeading ? 'Leading name' : 'Downside pressure',
    title: isLeading
      ? `${stock.symbol} is lifting the market`
      : `${stock.symbol} is weighing on the market`,
    detail: `${stock.company} · ${stock.subIndustry}${activity}`,
    metric: signedPercent(stock.dayReturn),
    tone: stock.dayReturn >= 0 ? 'positive' : 'negative',
    href: `/markets/stocks/${stock.symbol}`,
  }
}

function strongestGroup(groups: MarketGroupMetric[]): MarketGroupMetric | null {
  return groups
    .filter((group) => group.dayReturn !== null)
    .sort((left, right) => Math.abs(right.dayReturn ?? 0) - Math.abs(left.dayReturn ?? 0))[0] ?? null
}

function participationItem(leadership: MarketLeadershipSnapshot): MarketAttentionItem {
  const broad = leadership.advancingPercent >= 55
  const trendHealthy = leadership.above50DayPercent >= 50
  const title = broad
    ? 'Participation is supporting the move'
    : trendHealthy
      ? "Today's market is weaker than the intermediate trend"
      : 'Participation and trend health are both soft'
  return {
    id: 'participation',
    eyebrow: 'Market participation',
    title,
    detail: `${leadership.advancingPercent.toFixed(0)}% of the usable universe is advancing; ${leadership.above50DayPercent.toFixed(0)}% remains above its 50-day average.`,
    metric: `${leadership.advancingPercent.toFixed(0)}% adv.`,
    tone: broad ? 'positive' : 'negative',
    href: '/markets/explore?view=stocks',
  }
}

function groupItem(group: MarketGroupMetric): MarketAttentionItem {
  const positive = (group.dayReturn ?? 0) >= 0
  return {
    id: `group-${group.groupType}-${group.label}`,
    eyebrow: `Active ${group.groupType === 'sector' ? 'sector' : 'sub-industry'}`,
    title: `${group.label} is moving with breadth context`,
    detail: `${group.constituentCount} constituents · ${group.sector ?? group.label}`,
    metric: signedPercent(group.dayReturn ?? 0),
    tone: positive ? 'positive' : 'negative',
    href: `/markets/explore?view=${group.groupType === 'sector' ? 'sectors' : 'sub-industries'}&group=${encodeURIComponent(group.label)}`,
  }
}

export function buildMarketAttention(leadership: MarketLeadershipSnapshot | null | undefined): MarketAttentionItem[] {
  if (!leadership) return []
  const items: MarketAttentionItem[] = [participationItem(leadership)]
  const leading = stockItem(leadership.leaders[0] ?? leadership.stocks[0], 'leading')
  const falling = stockItem(leadership.laggards[0] ?? leadership.stocks.at(-1), 'falling')
  const group = strongestGroup(leadership.sectors.length > 0 ? leadership.sectors : leadership.subIndustries)

  if (leading) items.push(leading)
  if (falling && falling.id !== leading?.id) items.push(falling)
  if (group) items.push(groupItem(group))

  const divergence = leadership.divergences[0]
  if (divergence) {
    items.push({
      id: `divergence-${divergence.id}`,
      eyebrow: 'Divergence to investigate',
      title: divergence.groupLabel,
      detail: divergence.summary,
      metric: `${divergence.spread >= 0 ? '+' : ''}${divergence.spread.toFixed(1)}pp`,
      tone: 'neutral',
      href: `/markets/explore?view=sub-industries&group=${encodeURIComponent(divergence.groupLabel)}`,
    })
  }

  return items.slice(0, 5)
}

export function buildMarketCheckpoints(leadership: MarketLeadershipSnapshot | null | undefined): MarketCheckpoint[] {
  if (!leadership) return []
  const leader = leadership.leaders[0]
  const laggard = leadership.laggards[0]
  const spread = leader?.dayReturn !== null && leader?.dayReturn !== undefined && laggard?.dayReturn !== null && laggard?.dayReturn !== undefined
    ? leader.dayReturn - laggard.dayReturn
    : null

  return [
    {
      id: 'participation',
      label: 'Participation',
      value: `${leadership.advancingPercent.toFixed(0)}% advancing`,
      detail: `${leadership.above50DayPercent.toFixed(0)}% above 50-day`,
      tone: leadership.advancingPercent >= 55 ? 'positive' : 'negative',
    },
    {
      id: 'dispersion',
      label: 'Leadership spread',
      value: spread === null ? 'Unavailable' : `${spread >= 0 ? '+' : ''}${spread.toFixed(1)}pp`,
      detail: leader && laggard ? `${leader.symbol} versus ${laggard.symbol}` : 'Awaiting complete leader set',
      tone: spread !== null && spread >= 5 ? 'negative' : 'neutral',
    },
    {
      id: 'coverage',
      label: 'Data coverage',
      value: `${leadership.usableCount}/${leadership.universeCount}`,
      detail: `${leadership.freshCount} fresh series`,
      tone: leadership.usableCount === leadership.universeCount ? 'positive' : 'neutral',
    },
  ]
}
