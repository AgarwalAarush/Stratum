/** Only explicitly promoted current beliefs may appear as decision authority. */
export function canonicalCausalVersions<T extends Record<string, unknown>>(rows: T[], enabled: boolean): T[] {
  if (!enabled) return []
  const current = new Map<string, T>()
  for (const row of [...rows].sort((a, b) => String(b.created_at ?? b.as_of).localeCompare(String(a.created_at ?? a.as_of)))) {
    const freshness = row.freshness as Record<string, unknown> | null
    if (!['active', 'monitoring'].includes(String(row.state)) || freshness?.canonical !== true || row.source_kind !== 'world_node') continue
    const key = String(row.causal_key)
    if (!current.has(key)) current.set(key, row)
  }
  return [...current.values()]
}
