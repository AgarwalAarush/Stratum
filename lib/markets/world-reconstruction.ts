const WEEK_MS = 7 * 24 * 60 * 60_000

export function isHistoricalReconstructionRun(run: { branch: string }): boolean {
  return run.branch.startsWith('reconstruction/')
}

export interface ReconstructionWindow {
  week_start: string
  week_end: string
  source_count: number
  status: string
}

/** Count each persisted weekly window once. A retry cannot inherit or add to
 * old projection totals, and a gap cannot count as completed reconstruction. */
export function summarizeHistoricalReconstruction(sinceAt: string, cutoff: string, windows: ReconstructionWindow[]) {
  const start = Date.parse(sinceAt)
  const end = Date.parse(cutoff)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new Error('Historical reconstruction requires an increasing, valid time range')
  const byStart = new Map(windows.map((window) => [Date.parse(window.week_start), window]))
  let cursor = start
  let weeksCompleted = 0
  let weeksVerified = 0
  let sourcesScanned = 0
  while (cursor < end) {
    const window = byStart.get(cursor)
    const expectedEnd = Math.min(cursor + WEEK_MS, end)
    if (!window || Date.parse(window.week_end) !== expectedEnd || !['screened', 'documented_empty'].includes(window.status)) throw new Error('Historical reconstruction has an unresolved window before its cutoff')
    if (!Number.isSafeInteger(window.source_count) || window.source_count < 0) throw new Error('Historical reconstruction has an invalid observation count')
    weeksCompleted += 1
    weeksVerified += window.source_count > 0 ? 1 : 0
    sourcesScanned += window.source_count
    cursor = expectedEnd
  }
  return { weeksCompleted, weeksVerified, weeksUncovered: weeksCompleted - weeksVerified, sourcesScanned }
}
