import type { MarketAsset, MarketDailyBar, MarketSnapshot, ScreenerRow } from './types.ts'

const MINIMUM_DAILY_BARS = 50
const RELATIVE_VOLUME_WINDOW = 20
const YEAR_WINDOW = 252
const RETURN_LOOKBACK_TOLERANCE_DAYS = 7

function average(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((total, value) => total + value, 0) / values.length
}

function percentChange(value: number, baseline: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(baseline) || baseline === 0) return 0
  return ((value - baseline) / baseline) * 100
}

function round(value: number, precision = 2): number {
  const factor = 10 ** precision
  return Math.round(value * factor) / factor
}

function newYorkTradingDate(timestamp: string): string | null {
  const date = new Date(timestamp)
  if (!Number.isFinite(date.getTime())) return null
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

function nearestClose(bars: MarketDailyBar[], target: Date): number | null {
  let closest: MarketDailyBar | null = null
  let closestDistance = Number.POSITIVE_INFINITY

  for (const bar of bars) {
    const barTime = Date.parse(`${bar.tradingDate}T00:00:00.000Z`)
    const distance = Math.abs(barTime - target.getTime())
    const closestTime = closest ? Date.parse(`${closest.tradingDate}T00:00:00.000Z`) : Number.POSITIVE_INFINITY
    if (distance < closestDistance || (distance === closestDistance && barTime <= target.getTime() && closestTime > target.getTime())) {
      closest = bar
      closestDistance = distance
    }
  }

  return closest?.close ?? null
}

function historicalReturn(currentPrice: number, baseline: number | null | undefined): number | null {
  if (baseline == null || !Number.isFinite(currentPrice) || !Number.isFinite(baseline) || baseline === 0) return null
  return round(percentChange(currentPrice, baseline))
}

function returnAtLookback(currentPrice: number, bars: MarketDailyBar[], target: Date): number | null {
  const oldest = bars.at(-1)
  if (!oldest) return null
  const oldestTime = Date.parse(`${oldest.tradingDate}T00:00:00.000Z`)
  const latestEligibleBaseline = target.getTime() + RETURN_LOOKBACK_TOLERANCE_DAYS * 24 * 60 * 60 * 1_000
  if (!Number.isFinite(oldestTime) || oldestTime > latestEligibleBaseline) return null
  return historicalReturn(currentPrice, nearestClose(bars, target))
}

function daysBefore(tradingDate: string, days: number): Date {
  const target = new Date(`${tradingDate}T00:00:00.000Z`)
  target.setUTCDate(target.getUTCDate() - days)
  return target
}

export function calculateScreenerRow(
  asset: MarketAsset,
  snapshot: MarketSnapshot,
  bars: MarketDailyBar[],
): ScreenerRow | null {
  if (asset.symbol !== snapshot.symbol || bars.length < MINIMUM_DAILY_BARS) return null

  const currentTradingDate = newYorkTradingDate(snapshot.asOf)
  const sorted = [...bars]
    .filter((bar) => bar.symbol === asset.symbol && (
      !currentTradingDate || bar.tradingDate < currentTradingDate
    ))
    .sort((left, right) => right.tradingDate.localeCompare(left.tradingDate))

  if (sorted.length < MINIMUM_DAILY_BARS) return null

  const relativeVolumeBars = sorted.slice(0, RELATIVE_VOLUME_WINDOW)
  const fiftyDayBars = sorted.slice(0, 50)
  const yearBars = sorted.slice(0, YEAR_WINDOW)
  const averageVolume = average(relativeVolumeBars.map((bar) => bar.volume))
  const fiftyDayAverage = average(fiftyDayBars.map((bar) => bar.close))
  const yearLow = Math.min(...yearBars.map((bar) => bar.low))
  const yearHigh = Math.max(...yearBars.map((bar) => bar.high))
  const yearRange = yearHigh - yearLow
  const fiftyTwoWeekPosition = yearRange <= 0 ? 50 : ((snapshot.price - yearLow) / yearRange) * 100
  const asOfDate = currentTradingDate ?? sorted[0]!.tradingDate
  const asOfYear = Number(asOfDate.slice(0, 4))

  return {
    symbol: asset.symbol,
    company: asset.name,
    price: round(snapshot.price),
    dailyChange: round(percentChange(snapshot.price, snapshot.previousClose)),
    return5d: historicalReturn(snapshot.price, sorted[4]?.close),
    return30d: returnAtLookback(snapshot.price, sorted, daysBefore(asOfDate, 30)),
    return90d: returnAtLookback(snapshot.price, sorted, daysBefore(asOfDate, 90)),
    return180d: returnAtLookback(snapshot.price, sorted, daysBefore(asOfDate, 180)),
    returnYtd: Number.isFinite(asOfYear)
      ? returnAtLookback(snapshot.price, sorted, new Date(Date.UTC(asOfYear, 0, 1)))
      : null,
    return1y: returnAtLookback(snapshot.price, sorted, daysBefore(asOfDate, 365)),
    gap: round(percentChange(snapshot.open, snapshot.previousClose)),
    volume: snapshot.volume,
    relativeVolume: round(averageVolume > 0 ? snapshot.volume / averageVolume : 0),
    range: sorted.slice(0, 18).reverse().map((bar) => round(bar.close)),
    fiftyDayAverage: round(fiftyDayAverage),
    fiftyTwoWeekPosition: round(Math.max(0, Math.min(100, fiftyTwoWeekPosition))),
    exchange: asset.exchange,
    sector: 'Unclassified',
    subIndustry: 'Unclassified',
    tradable: asset.tradable && asset.active,
    asOf: snapshot.asOf,
  }
}
