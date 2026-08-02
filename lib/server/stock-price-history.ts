import type { MarketFeed, StockPricePoint } from '../markets/types.ts'
import { cachedFetchWithFallback, type CacheSource } from './cache.ts'
import { getAlpacaClient } from './alpaca.ts'

const FIVE_YEARS_CACHE_SECONDS = 15 * 60

export interface OnDemandStockPriceHistory {
  symbol: string
  history: StockPricePoint[]
  feed: Exclude<MarketFeed, 'illustrative'>
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

export async function fetchOnDemandFiveYearPriceHistory(
  symbol: string,
  preferredFeed: Exclude<MarketFeed, 'illustrative'>,
  now = new Date(),
): Promise<OnDemandStockPriceHistoryResult> {
  const client = getAlpacaClient()
  if (!client) throw new Error('Alpaca credentials are not configured')

  const { start, end } = fiveYearPriceHistoryRange(now)
  const result = await cachedFetchWithFallback({
    key: `stratum:markets:stock-history:${symbol}:${preferredFeed}:${start}:${end}`,
    ttlSeconds: FIVE_YEARS_CACHE_SECONDS,
    negativeTtlSeconds: 60,
    fetcher: async () => {
      const bars = await client.fetchDailyBars([symbol], start, end, preferredFeed)
      const history = bars.data
        .filter((bar) => bar.symbol === symbol)
        .sort((left, right) => left.tradingDate.localeCompare(right.tradingDate))
        .map((bar) => ({
          tradingDate: bar.tradingDate,
          close: bar.close,
          volume: bar.volume,
        }))
      if (history.length < 2) return null
      return {
        symbol,
        history,
        feed: bars.feed,
        dataAsOf: bars.data.at(-1)?.asOf ?? `${history.at(-1)!.tradingDate}T00:00:00.000Z`,
      }
    },
  })
  return result
}
