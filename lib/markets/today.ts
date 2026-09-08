export interface TodayDecision {
  symbol: string
  action: string
  portfolio_id: string | null
  reason: string
  expires_at: string
  gate_reasons: string[] | null
}
const capital = new Set(['buy', 'add', 'trim', 'sell'])
export function summarizeTodayDecisions(
  decisions: TodayDecision[],
  now = Date.now(),
) {
  const current = decisions.filter((d) => Date.parse(d.expires_at) > now)
  const cleared = current.filter(
    (d) =>
      capital.has(d.action) &&
      Array.isArray(d.gate_reasons) &&
      d.gate_reasons.length === 0,
  )
  return {
    expired: decisions.length - current.length,
    cleared: cleared.slice(0, 3),
    actionCount: cleared.length,
    hold: current.filter((d) => d.action === 'hold').length,
    investigate: current.filter((d) => ['watch', 'research'].includes(d.action))
      .length,
    blocked: current.filter(
      (d) => d.action === 'no_trade' || (d.gate_reasons?.length ?? 0) > 0,
    ).length,
  }
}
export function allocationPercent(
  invested: number | null,
  total: number | null,
): number | null {
  return typeof invested === 'number' &&
    Number.isFinite(invested) &&
    typeof total === 'number' &&
    Number.isFinite(total) &&
    total > 0
    ? Math.max(0, Math.min(100, (invested / total) * 100))
    : null
}
export function signedPercent(value: number | null): string {
  return typeof value === 'number' && Number.isFinite(value)
    ? `${value > 0 ? '+' : ''}${value.toFixed(2)}%`
    : 'Unavailable'
}
