import type { DecisionInboxItem, ThesisDecision } from './types.ts'

export interface MaterialEvent {
  id: string
  symbol: string
  title: string
  url: string
  category: string
  publishedAt: string
}

export function eventResearchDedupeKey(ownerId: string, event: MaterialEvent): string {
  return `research-refresh:${ownerId}:${event.symbol}:${event.id}`
}

export function killCriterionResearchDedupeKey(ownerId: string, alertDedupeKey: string): string {
  return `research-refresh:${ownerId}:${alertDedupeKey}`
}

export function evaluateDecisionAlerts(
  decision: ThesisDecision,
  currentPrice: number,
  occurredAt: string,
): Array<Omit<DecisionInboxItem, 'id' | 'createdAt' | 'status'>> {
  const alerts: Array<Omit<DecisionInboxItem, 'id' | 'createdAt' | 'status'>> = []
  if (
    decision.entryZoneLow !== null
    && decision.entryZoneHigh !== null
    && currentPrice >= decision.entryZoneLow
    && currentPrice <= decision.entryZoneHigh
  ) {
    alerts.push({
      type: 'entry_zone_arrival',
      symbol: decision.symbol,
      title: `${decision.symbol} entered its decision zone`,
      summary: `Price ${currentPrice.toFixed(2)} is inside ${decision.entryZoneLow.toFixed(2)}–${decision.entryZoneHigh.toFixed(2)}.`,
      evidence: [],
      dedupeKey: `entry-zone:${decision.id}:${Math.round(currentPrice * 100)}`,
      occurredAt,
    })
  }
  for (const criterion of decision.killCriteria) {
    if (criterion.metric !== 'price' || criterion.value === undefined || !criterion.operator) continue
    const breached = criterion.operator === 'lt' ? currentPrice < criterion.value : currentPrice > criterion.value
    if (!breached) continue
    alerts.push({
      type: 'kill_criterion_breach',
      symbol: decision.symbol,
      title: `${decision.symbol} breached a thesis kill criterion`,
      summary: `${criterion.description} Current price: ${currentPrice.toFixed(2)}.`,
      evidence: [],
      dedupeKey: `kill:${decision.id}:${criterion.id}`,
      occurredAt,
    })
  }
  return alerts
}
