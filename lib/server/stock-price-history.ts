import type { StockPricePoint } from '../markets/types.ts'
import { readSharedCache, writeSharedCache, type CacheSource } from './cache.ts'
import { fetchFmpStableJson } from './fmp.ts'

export const FIVE_YEARS_CACHE_SECONDS = 60 * 60

export interface OnDemandStockPriceHistory {
  symbol: string
  history: StockPricePoint[]
  provider: 'fmp'
  dataAsOf: string
}

export interface OnDemandStockPriceHistoryResult {
  data: OnDemandStockPriceHistory | null
  source: CacheSource
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function fiveYearPriceHistoryRange(now = new Date()): { start: string; end: string } {
  const start = new Date(now)
  start.setUTCFullYear(start.getUTCFullYear() - 5)
  return { start: isoDate(start), end: isoDate(now) }
}

export function fiveYearPriceHistoryCacheKey(symbol: string, now = new Date()): string {
  const { start, end } = fiveYearPriceHistoryRange(now)
  return `stratum:markets:stock-history:fmp:${symbol}:${start}:${end}`
}

interface FmpHistoricalPriceRow {
  date?: string
  close?: number
  volume?: number
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function normalizeFmpPriceHistory(rows: FmpHistoricalPriceRow[]): StockPricePoint[] {
  return rows.flatMap((row) => {
    const close = finiteNumber(row.close)
    const volume = finiteNumber(row.volume)
    if (!row.date || close === null || volume === null) return []
    return [{ tradingDate: row.date.slice(0, 10), close, volume }]
  }).sort((left, right) => left.tradingDate.localeCompare(right.tradingDate))
}

export async function loadOnDemandFiveYearPriceHistory(
  symbol: string,
  now = new Date(),
): Promise<OnDemandStockPriceHistoryResult> {
  return readSharedCache<OnDemandStockPriceHistory>(fiveYearPriceHistoryCacheKey(symbol, now))
}

/** Runs only on the private worker. The resulting price history is temporary
 * cache data, never a market_bars_daily/Supabase write. */
export async function cacheFmpFiveYearPriceHistory(
  symbol: string,
  now = new Date(),
): Promise<OnDemandStockPriceHistory> {
  const apiKey = process.env.FMP_API_KEY?.trim()
  if (!apiKey) throw new Error('FMP_API_KEY is not configured')
  const { start, end } = fiveYearPriceHistoryRange(now)
  const rows = await fetchFmpStableJson<FmpHistoricalPriceRow[]>(
    'historical-price-eod/full',
    { symbol, from: start, to: end },
    { apiKey },
  )
  const history = normalizeFmpPriceHistory(rows)
  if (history.length < 2) throw new Error(`FMP returned insufficient five-year price history for ${symbol}`)
  const result: OnDemandStockPriceHistory = {
    symbol,
    history,
    provider: 'fmp',
    dataAsOf: `${history.at(-1)!.tradingDate}T00:00:00.000Z`,
  }
  await writeSharedCache(fiveYearPriceHistoryCacheKey(symbol, now), result, FIVE_YEARS_CACHE_SECONDS)
  return result
}
