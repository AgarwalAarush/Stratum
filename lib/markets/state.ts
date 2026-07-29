import type { MarketInstrument, MarketMemo, MarketState, ScreenerRow } from './types.ts'

export interface MarketStateInputs {
  advancingPercent: number
  aboveFiftyDayPercent: number
  averageChange: number
  leaders: Array<{ symbol: string; change: number; relativeVolume: number }>
  laggards: Array<{ symbol: string; change: number; relativeVolume: number }>
  instruments: MarketInstrument[]
}

function signedPercent(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
}

export function buildDeterministicMarketMemo(
  inputs: MarketStateInputs,
  dataAsOf: string,
  generatedAt = new Date().toISOString(),
): MarketMemo {
  const leaders = inputs.leaders.slice(0, 3).map((item) => `${item.symbol} ${signedPercent(item.change)}`).join(', ')
  const laggards = inputs.laggards.slice(0, 3).map((item) => `${item.symbol} ${signedPercent(item.change)}`).join(', ')

  return {
    changes: [
      {
        id: 'breadth',
        body: `${inputs.advancingPercent.toFixed(2)}% of the tracked universe is advancing and ${inputs.aboveFiftyDayPercent.toFixed(2)}% trades above its 50-day average.`,
        source: 'Alpaca market data',
        sourceTime: dataAsOf,
      },
      {
        id: 'average-change',
        body: `The average daily move across the tracked universe is ${signedPercent(inputs.averageChange)}.`,
        source: 'Alpaca market data',
        sourceTime: dataAsOf,
      },
      {
        id: 'leadership',
        body: `Current leaders: ${leaders || 'unavailable'}. Current laggards: ${laggards || 'unavailable'}.`,
        source: 'Alpaca market data',
        sourceTime: dataAsOf,
      },
    ],
    sectorImplications: [],
    catalysts: ['Watch whether advancing participation and 50-day breadth confirm the current regime.'],
    risks: ['Leadership, breadth, and relative-volume signals can reverse between refreshes.'],
    watchItems: ['Advancing participation', '50-day breadth', 'Leadership and laggard dispersion'],
    generatedAt,
  }
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

export function calculateMarketState(rows: ScreenerRow[], dataAsOf: string): { state: MarketState; inputs: MarketStateInputs } {
  if (rows.length === 0) throw new Error('Cannot calculate market state without screener rows')

  const advancingPercent = (rows.filter((row) => row.dailyChange > 0).length / rows.length) * 100
  const aboveFiftyDayPercent = (rows.filter((row) => row.price > row.fiftyDayAverage).length / rows.length) * 100
  const averageChange = rows.reduce((sum, row) => sum + row.dailyChange, 0) / rows.length
  const ranked = [...rows].sort((left, right) => right.dailyChange - left.dailyChange)

  let regime = 'Mixed, selective leadership'
  if (advancingPercent >= 60 && aboveFiftyDayPercent >= 55) regime = 'Risk-On, broadening participation'
  else if (advancingPercent >= 55 && aboveFiftyDayPercent < 50) regime = 'Risk-On, narrowing breadth'
  else if (advancingPercent <= 40 && aboveFiftyDayPercent <= 45) regime = 'Risk-Off, broad weakness'
  else if (advancingPercent <= 45 && aboveFiftyDayPercent > 50) regime = 'Risk-Off, resilient breadth'

  const signalDistance = Math.abs(advancingPercent - 50) + Math.abs(aboveFiftyDayPercent - 50) + Math.min(20, Math.abs(averageChange) * 5)
  const confidence = Math.max(50, Math.min(90, Math.round(50 + signalDistance / 2)))

  return {
    state: { regime, confidence, dataAsOf },
    inputs: {
      advancingPercent: round(advancingPercent),
      aboveFiftyDayPercent: round(aboveFiftyDayPercent),
      averageChange: round(averageChange),
      leaders: ranked.slice(0, 8).map((row) => ({ symbol: row.symbol, change: row.dailyChange, relativeVolume: row.relativeVolume })),
      laggards: ranked.slice(-8).reverse().map((row) => ({ symbol: row.symbol, change: row.dailyChange, relativeVolume: row.relativeVolume })),
      // Cross-asset observations are materialized independently. Equity ETF
      // proxies must never be presented as the underlying indexes.
      instruments: [],
    },
  }
}
