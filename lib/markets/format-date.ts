const MARKET_TIME_ZONE = 'America/New_York'

function marketDate(value: string): Date {
  // A filing period such as 2026-04-30 is a calendar date, not UTC midnight.
  // Noon UTC keeps that date stable when rendered in the US market timezone.
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00.000Z`)
    : new Date(value)
}

export function formatMarketDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: MARKET_TIME_ZONE,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(marketDate(value))
}

export function formatMarketDateTime(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: MARKET_TIME_ZONE,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(value))
}
