import type { MarketFeed, ScreenerRow } from '../markets/types.ts'

export function marketFeed(value: unknown): MarketFeed | null {
  return value === 'illustrative' || value === 'delayed_sip' || value === 'iex' || value === 'sip' ? value : null
}

/** JSON columns still need runtime checks even when their SQL rows are typed. */
export function screenerHistory(value: unknown): ScreenerRow['history'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const feed = marketFeed(record.feed)
  const windows = record.windows
  if (!feed || typeof record.through !== 'string' || !Number.isFinite(Date.parse(record.through))
    || typeof record.barCount !== 'number' || !Number.isInteger(record.barCount) || record.barCount < 0
    || (record.completeness !== 'complete' && record.completeness !== 'partial')
    || !windows || typeof windows !== 'object' || Array.isArray(windows)) return undefined
  const counts = windows as Record<string, unknown>
  const validCount = (count: unknown): count is number => typeof count === 'number' && Number.isInteger(count) && count >= 0
  if (!validCount(counts.liquidity) || !validCount(counts.movingAverage) || !validCount(counts.year)) return undefined
  return {
    through: record.through, feed, barCount: record.barCount, completeness: record.completeness,
    windows: { liquidity: counts.liquidity, movingAverage: counts.movingAverage, year: counts.year },
  }
}
