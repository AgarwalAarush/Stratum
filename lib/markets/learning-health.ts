export function publicationHealth(value: string | null, maxAgeHours: number, now: number) {
  if (!value || !Number.isFinite(Date.parse(value))) return 'unavailable' as const
  const age = now - Date.parse(value)
  return age < 0 || age > maxAgeHours * 3_600_000 ? 'stale' as const : 'current' as const
}

export function economicLearningSummary(rows: Array<{ recommendation_id: string; horizon: string; content: Record<string, unknown> }>) {
  const latest = new Map<string, typeof rows[number]>()
  // Database supplies newest first: later vintages supersede earlier outcomes.
  for (const row of rows) {
    const key = `${row.recommendation_id}:${row.horizon}`
    if (!latest.has(key)) latest.set(key, row)
  }
  return [...latest.values()].filter(r => typeof r.content.outcome === 'boolean').slice(0, 5).map(r => ({
    confirmed: r.content.outcome === true,
    forecast: String((r.content.forecast as Record<string, unknown> | undefined)?.proposition ?? 'Economic forecast'),
    reason: String(r.content.reason ?? 'See the dated outcome assessment.'),
  }))
}
