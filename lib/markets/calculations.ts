import type { MarketAsset, MarketDailyBar, MarketSnapshot, ScreenerRow } from './types.ts'

const MINIMUM_DAILY_BARS = 50
const RELATIVE_VOLUME_WINDOW = 20
const YEAR_WINDOW = 252

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

  return {
    symbol: asset.symbol,
    company: asset.name,
    price: round(snapshot.price),
    dailyChange: round(percentChange(snapshot.price, snapshot.previousClose)),
    gap: round(percentChange(snapshot.open, snapshot.previousClose)),
    volume: snapshot.volume,
    relativeVolume: round(averageVolume > 0 ? snapshot.volume / averageVolume : 0),
    range: sorted.slice(0, 18).reverse().map((bar) => round(bar.close)),
    fiftyDayAverage: round(fiftyDayAverage),
    fiftyTwoWeekPosition: round(Math.max(0, Math.min(100, fiftyTwoWeekPosition))),
    exchange: asset.exchange,
    tradable: asset.tradable && asset.active,
    asOf: snapshot.asOf,
  }
}
