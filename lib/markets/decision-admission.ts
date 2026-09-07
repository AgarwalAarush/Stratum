type Row = Record<string, unknown>
const obj = (value: unknown): Row =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Row)
    : {}

/** Bounded discovery, independent of price momentum. Owned/watch names never lose coverage. */
export function admitDiscoveryCandidates(
  candidates: Row[],
  covered: Set<string>,
  cutoff: string,
  limit = 6,
) {
  const eligible = candidates
    .filter(
      (c) =>
        /^[A-Z][A-Z0-9.-]{0,11}$/.test(String(c.symbol)) &&
        !covered.has(String(c.symbol)) &&
        ['new', 'promoted', 'watchlisted'].includes(String(c.status)) &&
        Number.isFinite(Date.parse(String(c.generated_at))) &&
        Date.parse(String(c.generated_at)) <= Date.parse(cutoff) &&
        Date.parse(cutoff) - Date.parse(String(c.generated_at)) <
          7 * 86400000 &&
        (!c.snoozed_until ||
          Date.parse(String(c.snoozed_until)) <= Date.parse(cutoff)),
    )
    .sort(
      (a, b) =>
        String(b.generated_at).localeCompare(String(a.generated_at)) ||
        String(a.symbol).localeCompare(String(b.symbol)),
    )
  const selected: Row[] = [],
    seen = new Set<string>(),
    lanes = new Set<string>()
  // First pass represents distinct scout lanes; second fills the remaining capacity.
  for (const diverse of [true, false])
    for (const c of eligible) {
      const lane = String(obj(c.content).primaryLane ?? 'unclassified'),
        symbol = String(c.symbol)
      if (
        selected.length >= limit ||
        seen.has(symbol) ||
        (diverse && lanes.has(lane))
      )
        continue
      selected.push(c)
      seen.add(symbol)
      lanes.add(lane)
    }
  return selected
}

export function hasValidatedSystemThesis(
  note: Row | null,
  quality: Row,
  cutoff: string,
) {
  if (
    !note ||
    note.status !== 'complete' ||
    !quality.checkedAt ||
    !Array.isArray(quality.missing)
  )
    return false
  if (
    !Number.isFinite(Date.parse(String(quality.checkedAt))) ||
    Date.parse(String(quality.checkedAt)) > Date.parse(cutoff)
  )
    return false
  const content = obj(note.content)
  return (
    ['investmentThesis', 'keyDebate', 'fastestKillSignal'].every(
      (k) =>
        typeof content[k] === 'string' &&
        String(content[k]).trim().length >= 8,
    ) &&
    Array.isArray(content.sourceIds) &&
    content.sourceIds.length > 0 &&
    Array.isArray(content.sections) &&
    content.sections.length >= 12 &&
    typeof content.confidence === 'number' &&
    Number.isFinite(content.confidence) &&
    content.confidence >= 0 &&
    content.confidence <= 100
  )
}
