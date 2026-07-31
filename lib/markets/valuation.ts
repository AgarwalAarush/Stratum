export interface ForwardAnnualEstimate {
  date: string
  eps: number
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function estimateDate(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const match = value.match(/^\d{4}-\d{2}-\d{2}/)
  return match?.[0] ?? null
}

export function selectForwardAnnualEstimate(
  estimates: unknown,
  dataAsOf: Date | string,
): ForwardAnnualEstimate | null {
  if (!Array.isArray(estimates)) return null
  const cutoff = (dataAsOf instanceof Date ? dataAsOf.toISOString() : dataAsOf).slice(0, 10)
  return estimates
    .map(record)
    .flatMap((item) => {
      const date = estimateDate(item.date ?? item.fiscalDateEnding)
      const eps = finiteNumber(item.estimatedEpsAvg ?? item.epsAvg)
      return date && eps !== null && eps > 0 && date >= cutoff ? [{ date, eps }] : []
    })
    .sort((left, right) => left.date.localeCompare(right.date))[0] ?? null
}

export function forwardPriceToEarnings(
  price: number | null | undefined,
  estimate: ForwardAnnualEstimate | null,
): number | null {
  return price !== null
    && price !== undefined
    && Number.isFinite(price)
    && price > 0
    && estimate
    && estimate.eps > 0
    ? price / estimate.eps
    : null
}
