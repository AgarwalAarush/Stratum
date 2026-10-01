export interface ExchangeSession { date: string; open: string; close: string }

/** Convert exchange-local wall time using the offset on that date (including DST). */
export function exchangeSessionClose(session: ExchangeSession): number {
  if (/T/.test(session.close)) return Date.parse(session.close)
  const target = Date.parse(`${session.date}T${session.close.length === 5 ? `${session.close}:00` : session.close}Z`)
  let utc = target
  for (let attempt = 0; attempt < 3; attempt++) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(utc))
    const part = (key: string) => parts.find(p => p.type === key)?.value
    const wall = Date.parse(`${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}:${part('second')}Z`)
    utc += target - wall
  }
  return utc
}

export function lastCompletedSession(
  sessions: readonly ExchangeSession[], now = new Date(), delayMs = 15 * 60_000,
): ExchangeSession | null {
  return sessions.filter(s => exchangeSessionClose(s) + delayMs <= now.getTime())
    .sort((a, b) => b.date.localeCompare(a.date))[0] ?? null
}

export function nextCalendarDate(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)
}
