import type { MarketInstrument, MarketState, ScreenerRow } from './types.ts'

const INSTRUMENTS = [
  { symbol: 'SPY', label: 'S&P 500 ETF' },
  { symbol: 'QQQ', label: 'Nasdaq 100 ETF' },
  { symbol: 'IWM', label: 'Russell 2000 ETF' },
  { symbol: 'TLT', label: '20Y Treasuries' },
  { symbol: 'UUP', label: 'US Dollar ETF' },
  { symbol: 'USO', label: 'WTI Oil ETF' },
] as const

export interface MarketStateInputs {
  advancingPercent: number
  aboveFiftyDayPercent: number
  averageChange: number
  leaders: Array<{ symbol: string; change: number; relativeVolume: number }>
  laggards: Array<{ symbol: string; change: number; relativeVolume: number }>
  instruments: MarketInstrument[]
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

function instrumentsFromRows(rows: ScreenerRow[]): MarketInstrument[] {
  const bySymbol = new Map(rows.map((row) => [row.symbol, row]))
  return INSTRUMENTS.flatMap(({ symbol, label }) => {
    const row = bySymbol.get(symbol)
    if (!row) return []
    return [{
      id: symbol.toLowerCase(),
      label,
      value: row.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      change: `${row.dailyChange >= 0 ? '+' : ''}${row.dailyChange.toFixed(2)}%`,
      direction: row.dailyChange >= 0 ? 'up' as const : 'down' as const,
    }]
  })
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
      instruments: instrumentsFromRows(rows),
    },
  }
}
