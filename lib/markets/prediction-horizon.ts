const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
}

const NUMBER_TOKEN = '(?:\\d+(?:\\.\\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)'
const UNIT_TOKEN = '(day|week|month|quarter|year)s?'

function quantity(value: string): number {
  return NUMBER_WORDS[value] ?? Number(value)
}

function durationDays(value: number, unit: string): number {
  if (unit === 'day') return value
  if (unit === 'week') return value * 7
  if (unit === 'month') return value * 30.4375
  if (unit === 'quarter') return value * 91.3125
  return value * 365.25
}

/** Parse the upper bound of a compact natural-language duration. Models often
 * emit `within 3 months`, `one quarter`, or `6-12 months` even when prompted
 * for `3 months`; all describe the same deterministic deadline contract. */
export function predictionHorizonDays(horizon: string): number | null {
  const normalized = horizon.toLowerCase().trim().replace(/[–—]/g, '-')
  const range = normalized.match(new RegExp(`\\b(${NUMBER_TOKEN})\\s*(?:-|to)\\s*(${NUMBER_TOKEN})\\s*-?\\s*${UNIT_TOKEN}\\b`))
  if (range) {
    const upper = quantity(range[2]!)
    const days = durationDays(upper, range[3]!)
    return Number.isFinite(days) && days > 0 ? days : null
  }
  const single = normalized.match(new RegExp(`\\b(${NUMBER_TOKEN})\\s*-?\\s*${UNIT_TOKEN}\\b`))
  if (!single) return null
  const days = durationDays(quantity(single[1]!), single[2]!)
  return Number.isFinite(days) && days > 0 ? days : null
}
