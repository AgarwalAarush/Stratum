import type { ScreenerReturnField, StockPricePoint } from './types.ts'

export const PRICE_HISTORY_PERIODS: Array<{
  id: ScreenerReturnField
  label: string
  chartLabel: string
}> = [
  { id: 'dailyChange', label: 'Today', chartLabel: '1-day price history' },
  { id: 'return5d', label: '1 week', chartLabel: '1-week price history' },
  { id: 'return30d', label: '1 month', chartLabel: '1-month price history' },
  { id: 'return90d', label: '3 months', chartLabel: '3-month price history' },
  { id: 'return180d', label: '6 months', chartLabel: '6-month price history' },
  { id: 'returnYtd', label: 'Year to date', chartLabel: 'Year-to-date price history' },
  { id: 'return1y', label: '1 year', chartLabel: '1-year price history' },
]

const SESSION_COUNTS: Partial<Record<ScreenerReturnField, number>> = {
  dailyChange: 2,
  return5d: 6,
  return30d: 31,
  return90d: 91,
  return180d: 181,
}

export function priceHistoryPeriod(period: ScreenerReturnField) {
  return PRICE_HISTORY_PERIODS.find((candidate) => candidate.id === period)!
}

export function historyForPeriod(history: StockPricePoint[], period: ScreenerReturnField): StockPricePoint[] {
  if (period === 'return1y') return history
  if (period === 'returnYtd') {
    const latest = history.at(-1)
    if (!latest) return history
    const yearStart = `${latest.tradingDate.slice(0, 4)}-01-01`
    return history.filter((point) => point.tradingDate >= yearStart)
  }
  const sessions = SESSION_COUNTS[period]
  return sessions ? history.slice(-sessions) : history
}
