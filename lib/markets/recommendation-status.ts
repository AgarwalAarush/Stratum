import { isActionableCapitalChange } from './recommendation-display.ts'
import type { Recommendation } from './recommendations.ts'
type StatusInput = Pick<
  Recommendation,
  'action' | 'reason' | 'gateReasons' | 'expiresAt'
>
const definitions = {
  forecast: {
    label: 'Expected outcome needs evidence',
    detail: 'A measurable, evidence-backed forecast is missing.',
  },
  entry: {
    label: 'Entry case not established',
    detail: 'Research has not established a reason to commit capital now.',
  },
  stale: {
    label: 'Evidence needs refreshing',
    detail:
      'The decision cites stale or missing price, research, or holdings data.',
  },
  identity: {
    label: 'Security identity unresolved',
    detail: 'The system cannot reliably match the instrument to its evidence.',
  },
  review: {
    label: 'Decision failed review',
    detail:
      'A supporting claim, position size, or portfolio check remains unresolved.',
  },
} as const
export function recommendationStatus(rows: StatusInput[], now = Date.now()) {
  const current = rows.filter((r) => Date.parse(r.expiresAt) > now)
  const approved = current.filter((r) =>
    isActionableCapitalChange(r, now),
  ).length
  const rejected = current.filter((r) => Boolean(r.gateReasons?.length)).length
  const deferred = current.filter(
    (r) => r.action === 'no_trade' && !r.gateReasons?.length,
  ).length
  const expired = rows.length - current.length
  const counts: Partial<Record<keyof typeof definitions, number>> = {}
  for (const r of current.filter(
    (r) => r.action === 'no_trade' || r.gateReasons?.length,
  )) {
    const text = [...(r.gateReasons ?? []), r.reason].join(' ')
    const key = /measurable forecast|evidence-backed.*forecast/i.test(text)
      ? 'forecast'
      : /identity/i.test(text)
        ? 'identity'
        : /stale|unavailable|missing|future-dated/i.test(text)
          ? 'stale'
          : /entry.readiness|entry.ready/i.test(text)
            ? 'entry'
            : 'review'
    counts[key] = (counts[key] ?? 0) + 1
  }
  const reasons = Object.entries(counts)
    .map(([key, count]) => ({
      key,
      count: count!,
      ...definitions[key as keyof typeof definitions],
    }))
    .sort((a, b) => b.count - a.count)
  const title = approved
    ? `${approved} ${approved === 1 ? 'change' : 'changes'} to consider`
    : !rows.length
      ? 'No assessment published'
      : expired
        ? 'Assessment needs refreshing'
        : rejected || deferred
          ? 'No actionable recommendation yet'
          : 'No portfolio changes recommended'
  const description = approved
    ? 'Review the evidence, entry conditions, and position size before acting.'
    : !rows.length
      ? 'There are no published decisions available to assess.'
      : expired
        ? `${expired} decisions have expired. A fresh assessment is needed before acting.`
        : rejected || deferred
          ? `${rows.length} account decisions assessed. ${rejected} failed review; ${deferred} were deferred. This is not an all-clear for existing holdings.`
          : 'The current assessment recommends no capital changes. Holds remain in the archive.'
  return {
    title,
    description,
    approved,
    rejected,
    deferred,
    expired,
    total: rows.length,
    reasons,
  }
}
