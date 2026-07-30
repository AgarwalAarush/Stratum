export interface IndustryMonitorState {
  snapshotId: string
  dataAsOf: string
  return30d: number | null
  return1y: number | null
  vs50DayAverage: number | null
  rank30d: number | null
}

export interface ThesisMonitorSignal {
  reasonCode: 'leadership_break' | 'momentum_reversal' | 'rank_deterioration'
  severity: 'attention' | 'urgent'
  summary: string
}

export function evaluateIndustryThesisSignals(
  previous: IndustryMonitorState | null,
  current: IndustryMonitorState,
): ThesisMonitorSignal[] {
  if (!previous || previous.snapshotId === current.snapshotId) return []
  const signals: ThesisMonitorSignal[] = []
  if (
    previous.vs50DayAverage !== null
    && current.vs50DayAverage !== null
    && previous.vs50DayAverage >= 0
    && current.vs50DayAverage < 0
  ) {
    signals.push({
      reasonCode: 'leadership_break',
      severity: 'urgent',
      summary: `The group moved below its 50-day trend (${current.vs50DayAverage.toFixed(1)}%).`,
    })
  }
  if (
    previous.return30d !== null
    && current.return30d !== null
    && previous.return30d - current.return30d >= 5
  ) {
    signals.push({
      reasonCode: 'momentum_reversal',
      severity: current.return30d < 0 ? 'urgent' : 'attention',
      summary: `Thirty-day leadership weakened ${(previous.return30d - current.return30d).toFixed(1)} percentage points.`,
    })
  }
  if (
    previous.rank30d !== null
    && current.rank30d !== null
    && current.rank30d - previous.rank30d >= 10
  ) {
    signals.push({
      reasonCode: 'rank_deterioration',
      severity: 'attention',
      summary: `The group's 30-day rank fell from ${previous.rank30d} to ${current.rank30d}.`,
    })
  }
  return signals
}
