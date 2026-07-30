import type { CandidateBrief, CandidateWeeklySummary } from './types.ts'

const CANDIDATE_STATUSES: CandidateBrief['status'][] = [
  'new',
  'dismissed',
  'snoozed',
  'watchlisted',
  'promoted',
]

function toUtcDate(value: string): Date {
  const date = new Date(`${value}T12:00:00.000Z`)
  if (!Number.isFinite(date.getTime())) throw new Error(`Invalid trading date: ${value}`)
  return date
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10)
}

export function candidateWeekStart(weekEnding: string): string {
  const date = toUtcDate(weekEnding)
  const day = date.getUTCDay()
  const daysSinceMonday = day === 0 ? 6 : day - 1
  date.setUTCDate(date.getUTCDate() - daysSinceMonday)
  return isoDate(date)
}

export function buildCandidateWeeklySummary(
  briefs: CandidateBrief[],
  options: { weekEnding: string; generatedAt: string },
): CandidateWeeklySummary {
  const statusCounts = Object.fromEntries(CANDIDATE_STATUSES.map((status) => [status, 0])) as CandidateWeeklySummary['statusCounts']
  const groups = new Map<string, { label: string; sector: string; candidateCount: number }>()

  for (const brief of briefs) {
    statusCounts[brief.status] += 1
    const key = `${brief.sector}\u0000${brief.subIndustry}`
    const group = groups.get(key) ?? { label: brief.subIndustry, sector: brief.sector, candidateCount: 0 }
    group.candidateCount += 1
    groups.set(key, group)
  }

  const ordered = [...briefs].sort((left, right) =>
    right.generatedAt.localeCompare(left.generatedAt)
    || left.symbol.localeCompare(right.symbol),
  )

  return {
    weekEnding: options.weekEnding,
    periodStart: candidateWeekStart(options.weekEnding),
    generatedAt: options.generatedAt,
    candidateCount: briefs.length,
    uniqueSymbolCount: new Set(briefs.map((brief) => brief.symbol)).size,
    statusCounts,
    leadingSubIndustries: [...groups.values()]
      .sort((left, right) => right.candidateCount - left.candidateCount || left.label.localeCompare(right.label))
      .slice(0, 3),
    highlights: ordered.slice(0, 5).map((brief) => ({
      symbol: brief.symbol,
      company: brief.company,
      subIndustry: brief.subIndustry,
      whySurfaced: brief.whySurfaced,
      status: brief.status,
    })),
  }
}
