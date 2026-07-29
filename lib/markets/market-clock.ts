export interface NewYorkClockParts {
  date: string
  weekday: string
  hour: number
  minute: number
}

export function newYorkClockParts(now: Date): NewYorkClockParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? ''
  return {
    date: `${part('year')}-${part('month')}-${part('day')}`,
    weekday: part('weekday'),
    hour: Number(part('hour')),
    minute: Number(part('minute')),
  }
}

export function isUsMarketWeekday(now: Date): boolean {
  const { weekday } = newYorkClockParts(now)
  return weekday !== 'Sat' && weekday !== 'Sun'
}

export function isWeekdayAfterMarketClose(now: Date): boolean {
  const { weekday, hour, minute } = newYorkClockParts(now)
  return weekday !== 'Sat'
    && weekday !== 'Sun'
    && hour * 60 + minute > 16 * 60 + 5
}

export function isUsMarketRefreshWindow(now: Date): boolean {
  const { weekday, hour, minute } = newYorkClockParts(now)
  if (weekday === 'Sat' || weekday === 'Sun') return false
  const minutes = hour * 60 + minute
  return minutes >= 9 * 60 + 30 && minutes <= 16 * 60 + 5
}

export function fmpIntelligenceCadenceMinutes(now: Date): number {
  const { weekday, hour } = newYorkClockParts(now)
  const weekdaySession = weekday !== 'Sat' && weekday !== 'Sun' && hour >= 7 && hour < 22
  return weekdaySession ? 15 : 120
}

export type MarketMemoSlot = 'open' | 'midday' | 'close'

export function marketMemoSlot(now: Date): { date: string; slot: MarketMemoSlot } | null {
  if (!isUsMarketRefreshWindow(now)) return null
  const { date, hour, minute } = newYorkClockParts(now)
  const minutes = hour * 60 + minute
  if (minutes >= 10 * 60 && minutes < 10 * 60 + 10) return { date, slot: 'open' }
  if (minutes >= 13 * 60 && minutes < 13 * 60 + 10) return { date, slot: 'midday' }
  if (minutes >= 15 * 60 + 55) return { date, slot: 'close' }
  return null
}
