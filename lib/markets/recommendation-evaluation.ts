export type EvaluationBar = {
  date: string
  open: number
  close: number
  high: number
  low: number
}
export type Markout = {
  status: 'resolved' | 'not_due' | 'needs_data'
  reason: string
  startDate: string | null
  endDate: string | null
  grossReturn: number | null
  netReturn: number | null
  benchmarkReturn: number | null
  excessReturn: number | null
  maximumFavorableExcursion: number | null
  maximumAdverseExcursion: number | null
  drawdown: number | null
  conditionalEntry: 'not_applicable' | 'triggered' | 'unfilled' | 'unverifiable'
}
/** Calendar dates come from the exchange calendar, not weekday arithmetic.
 * Conservative common execution: next session strictly after issue date. */
export function evaluateMarkout(input: {
  issuedDate: string
  sessions: string[]
  completedThrough: string
  horizon: number
  bars: EvaluationBar[]
  benchmark: EvaluationBar[]
  costBps: number
  maxEntryPrice?: number | null
}): Markout {
  const dates = [...new Set(input.sessions)]
    .sort()
    .filter((d) => d > input.issuedDate)
  const startDate = dates[0] ?? null,
    endDate = dates[input.horizon - 1] ?? null
  const empty: Markout = {
    status: 'not_due',
    reason: 'Required trading sessions have not completed.',
    startDate,
    endDate,
    grossReturn: null,
    netReturn: null,
    benchmarkReturn: null,
    excessReturn: null,
    maximumFavorableExcursion: null,
    maximumAdverseExcursion: null,
    drawdown: null,
    conditionalEntry: 'not_applicable',
  }
  if (!endDate || endDate > input.completedThrough) return empty
  const path = dates
    .slice(0, input.horizon)
    .map((d) => input.bars.find((b) => b.date === d))
  const reference = path[0],
    endpoint = path.at(-1),
    benchmarkStart = input.benchmark.find((b) => b.date === startDate),
    benchmarkEnd = input.benchmark.find((b) => b.date === endDate)
  if (
    path.some((b) => !b) ||
    !reference ||
    !endpoint ||
    !benchmarkStart ||
    !benchmarkEnd ||
    [
      reference.open,
      endpoint.close,
      benchmarkStart.open,
      benchmarkEnd.close,
    ].some((v) => !Number.isFinite(v) || v <= 0)
  )
    return {
      ...empty,
      status: 'needs_data',
      reason:
        'Missing prices, corporate-action continuity or benchmark observations; delisted names remain unresolved.',
    }
  const gross = endpoint.close / reference.open - 1,
    benchmark = benchmarkEnd.close / benchmarkStart.open - 1
  let peak = reference.open,
    drawdown = 0
  for (const bar of path) {
    peak = Math.max(peak, bar!.high)
    drawdown = Math.min(drawdown, bar!.low / peak - 1)
  }
  return {
    ...empty,
    status: 'resolved',
    reason:
      'Prospective next-session-open signal markout using one adjusted price vintage; no actual fill is assumed.',
    grossReturn: gross,
    netReturn: gross - input.costBps / 10000,
    benchmarkReturn: benchmark,
    excessReturn: gross - benchmark - input.costBps / 10000,
    maximumFavorableExcursion: Math.max(
      ...path.map((b) => b!.high / reference.open - 1),
    ),
    maximumAdverseExcursion: Math.min(
      ...path.map((b) => b!.low / reference.open - 1),
    ),
    drawdown,
    conditionalEntry:
      input.maxEntryPrice == null ? 'not_applicable' : 'unverifiable',
  }
}

export function calibration(
  observations: Array<{
    episodeId: string
    probability: number
    outcome: boolean | null
  }>,
) {
  // One resolved forecast per episode avoids treating daily repeated advice as independent.
  const episodes = new Map<string, { probability: number; outcome: boolean }>()
  const firstByEpisode = new Map<string, (typeof observations)[number]>()
  for (const o of observations)
    if (!firstByEpisode.has(o.episodeId)) firstByEpisode.set(o.episodeId, o)
  for (const o of firstByEpisode.values())
    if (o.outcome !== null && o.probability > 0 && o.probability < 1)
      episodes.set(o.episodeId, {
        probability: o.probability,
        outcome: o.outcome,
      })
  const sample = [...episodes.values()],
    n = sample.length
  const baseRate = n ? sample.filter((o) => o.outcome).length / n : null
  const brier = n
    ? sample.reduce((s, o) => s + (o.probability - Number(o.outcome)) ** 2, 0) /
      n
    : null
  const logLoss = n
    ? -sample.reduce(
        (s, o) =>
          s +
          (o.outcome ? Math.log(o.probability) : Math.log(1 - o.probability)),
        0,
      ) / n
    : null
  const bins = Array.from({ length: 5 }, (_, i) => {
    const xs = sample.filter((o) => Math.floor(o.probability * 5) === i)
    return {
      lower: i / 5,
      upper: (i + 1) / 5,
      count: xs.length,
      predicted: xs.length
        ? xs.reduce((s, o) => s + o.probability, 0) / xs.length
        : null,
      observed: xs.length
        ? xs.filter((o) => o.outcome).length / xs.length
        : null,
    }
  })
  return {
    independentEpisodes: n,
    unresolved: [...firstByEpisode.values()].filter((o) => o.outcome === null)
      .length,
    baseRate,
    brier,
    logLoss,
    bins,
    baselineBrier: baseRate === null ? null : baseRate * (1 - baseRate),
    promotionEligible: false,
    reason:
      n < 30
        ? 'Fewer than 30 independent episodes; descriptive evidence only.'
        : 'Owner-reviewed preregistered prospective comparison required before promotion.',
  }
}

/** Fixed decomposition: selection first, then timing, sizing, risk overlay.
 * Missing inputs stay unavailable; the terms are accounting counterfactuals. */
export function attributeDecision(input: {
  selectionReturn: number | null
  benchmarkReturn: number | null
  timedReturn: number | null
  baselineWeight: number | null
  recommendedWeight: number | null
  riskManagedReturn: number | null
  ownerReturn: number | null
}) {
  const {
    selectionReturn: s,
    benchmarkReturn: b,
    timedReturn: t,
    baselineWeight: w,
    recommendedWeight: r,
    riskManagedReturn: k,
    ownerReturn: o,
  } = input
  return {
    selection: s !== null && b !== null && w !== null ? (s - b) * w : null,
    timing: t !== null && s !== null && w !== null ? (t - s) * w : null,
    sizing: r !== null && w !== null && t !== null ? (r - w) * t : null,
    riskManagement: k !== null && t !== null && r !== null ? (k - t) * r : null,
    ownerDifference: o !== null && k !== null && r !== null ? o - k * r : null,
    method:
      'Fixed sequential counterfactual decomposition; unavailable terms are not zero. Not causal proof.',
  }
}

export function evaluateEntryRule(input: {
  issuedDate: string
  expiresDate: string
  expiresAt?: string
  sessionOpens?: Record<string, string>
  endDate: string
  bars: EvaluationBar[]
  sessions: string[]
  trigger: 'next_session_open' | 'next_open_below_ceiling' | 'manual_condition'
  ceiling: number | null
}) {
  if (input.trigger === 'manual_condition')
    return {
      status: 'unverifiable' as const,
      entryDate: null,
      entryPrice: null,
      return: null,
      reason:
        'Additional owner-observed conditions cannot be inferred from daily bars.',
    }
  const eligible = input.sessions
    .filter(
      (d) =>
        d > input.issuedDate && d <= input.expiresDate && d <= input.endDate,
    )
    .sort()
  if (!eligible.length)
    return {
      status: 'unfilled' as const,
      entryDate: null,
      entryPrice: null,
      return: null,
      reason: 'No eligible exchange session before expiry.',
    }
  for (const date of eligible) {
    if (input.expiresAt) {
      const openedAt = input.sessionOpens?.[date]
      if (!openedAt || !Number.isFinite(Date.parse(openedAt)))
        return {
          status: 'needs_data' as const,
          entryDate: null,
          entryPrice: null,
          return: null,
          reason: 'Exact exchange opening time is required to test expiry.',
        }
      if (Date.parse(openedAt) > Date.parse(input.expiresAt)) continue
    }
    const bar = input.bars.find((b) => b.date === date)
    if (!bar)
      return {
        status: 'needs_data' as const,
        entryDate: null,
        entryPrice: null,
        return: null,
        reason: 'Missing entry-session observation.',
      }
    if (
      input.trigger === 'next_open_below_ceiling' &&
      (input.ceiling === null || bar.open > input.ceiling)
    )
      continue
    const endpoint = input.bars.find((b) => b.date === input.endDate)
    if (!endpoint)
      return {
        status: 'needs_data' as const,
        entryDate: null,
        entryPrice: null,
        return: null,
        reason: 'Missing evaluation endpoint.',
      }
    return {
      status: 'triggered' as const,
      entryDate: date,
      entryPrice: bar.open,
      return: endpoint.close / bar.open - 1,
      reason:
        'Predeclared opening-price model execution; excludes actual owner fills.',
    }
  }
  return {
    status: 'unfilled' as const,
    entryDate: null,
    entryPrice: null,
    return: null,
    reason: 'No eligible opening price met the ceiling before expiry.',
  }
}

/** Convert a dated exchange wall-clock time without guessing a fixed DST offset. */
export function exchangeOpeningTimestamp(date: string, time: string): string {
  if (time.includes('T')) {
    if (!Number.isFinite(Date.parse(time)))
      throw new Error('Invalid exchange opening time')
    return new Date(time).toISOString()
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}(:\d{2})?$/.test(time))
    throw new Error('Invalid exchange calendar opening')
  const wall = Date.parse(`${date}T${time.length === 5 ? time + ':00' : time}Z`)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    timeZoneName: 'longOffset',
  }).formatToParts(new Date(wall))
  const offset = parts
    .find((p) => p.type === 'timeZoneName')
    ?.value.match(/GMT([+-])(\d{2}):(\d{2})/)
  if (!offset) throw new Error('Exchange timezone offset unavailable')
  const minutes =
    (Number(offset[2]) * 60 + Number(offset[3])) * (offset[1] === '-' ? -1 : 1)
  return new Date(wall - minutes * 60000).toISOString()
}

/** Value of reducing exposure versus keeping the same shares, holding proceeds
 * in zero-yield cash. This is distinct from stock-picking and never scores a
 * full sale as zero merely because the remaining target weight is zero. */
export function riskReductionAttribution(
  currentWeight: number | null,
  targetWeight: number | null,
  remainingReturn: number | null,
) {
  if (
    currentWeight === null ||
    targetWeight === null ||
    remainingReturn === null ||
    targetWeight > currentWeight
  )
    return null
  return -(currentWeight - targetWeight) * remainingReturn
}

export function evaluateOwnerFills(input: {
  fills: Array<{
    id: string
    side: 'buy' | 'sell'
    quantity: number
    price: number
    sessionDate: string
  }>
  raw: EvaluationBar[]
  adjusted: EvaluationBar[]
  endDate: string
  portfolioValue: number | null
}) {
  const end = input.adjusted.find((b) => b.date === input.endDate)
  const fills = input.fills.map((fill) => {
    const raw = input.raw.find((b) => b.date === fill.sessionDate),
      adjusted = input.adjusted.find((b) => b.date === fill.sessionDate)
    if (
      !raw ||
      !adjusted ||
      !end ||
      ![raw.close, adjusted.close, end.close, fill.price, fill.quantity].every(
        (n) => Number.isFinite(n) && n > 0,
      )
    )
      return { id: fill.id, status: 'needs_data', dollarEffect: null }
    // Use the same captured raw/adjusted pair to put endpoint wealth in fill-day
    // share units. This handles provider split/dividend adjustments without
    // separately adding a dividend or mistaking a split for investment performance.
    const equivalentEnd = end.close / (adjusted.close / raw.close)
    const dollarEffect =
      (equivalentEnd - fill.price) *
      fill.quantity *
      (fill.side === 'buy' ? 1 : -1)
    return {
      id: fill.id,
      status: 'resolved',
      dollarEffect,
      side: fill.side,
      quantity: fill.quantity,
      fillPrice: fill.price,
      equivalentEnd,
    }
  })
  const dollars =
    fills.length && fills.every((f) => f.dollarEffect !== null)
      ? fills.reduce((sum, f) => sum + f.dollarEffect!, 0)
      : null
  return {
    fills,
    dollarEffect: dollars,
    portfolioContribution:
      dollars !== null && input.portfolioValue
        ? dollars / input.portfolioValue
        : null,
    method:
      'Owner-reported incremental trades versus unchanged holdings/cash, in fill-day share units using one raw/adjusted provider vintage. Buy measures wealth gained; sell measures gain/loss avoided. Not broker-reconciled realized P&L; fees, tax and cash interest excluded.',
  }
}
