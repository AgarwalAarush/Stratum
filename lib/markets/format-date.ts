const MARKET_TIME_ZONE = 'America/New_York'

export function formatMarketDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: MARKET_TIME_ZONE,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value))
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
