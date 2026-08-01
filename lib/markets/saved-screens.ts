import { parseScreenerQuery, ScreenerValidationError } from './screener.ts'
import type { SavedScreenerQuery, SavedScreenerScreen } from './types.ts'

export const SAVED_SCREENS_STORAGE_KEY = 'stratum:markets:saved-screens:v1'
export const LEGACY_SAVED_SCREEN_STORAGE_KEY = 'stratum:markets:saved-screen:v1'
export const MAX_SAVED_SCREENS = 20
export const MAX_SAVED_SCREEN_NAME_LENGTH = 48

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

export function parseSavedScreenName(value: unknown): string {
  if (typeof value !== 'string') throw new ScreenerValidationError('Screen name is required')
  const name = value.trim().replace(/\s+/g, ' ')
  if (!name) throw new ScreenerValidationError('Screen name is required')
  if (name.length > MAX_SAVED_SCREEN_NAME_LENGTH) {
    throw new ScreenerValidationError(`Screen name must be ${MAX_SAVED_SCREEN_NAME_LENGTH} characters or fewer`)
  }
  return name
}

export function parseSavedScreenerQuery(value: unknown): SavedScreenerQuery {
  const input = record(value)
  const query = parseScreenerQuery({ ...input, page: 1, pageSize: 50 })
  return {
    preset: query.preset,
    filters: query.filters,
    sort: query.sort,
    direction: query.direction,
  }
}

function parseSavedScreen(value: unknown): SavedScreenerScreen | null {
  try {
    const input = record(value)
    if (typeof input.id !== 'string' || !input.id.trim()) return null
    if (typeof input.createdAt !== 'string' || typeof input.updatedAt !== 'string') return null
    return {
      id: input.id.trim(),
      name: parseSavedScreenName(input.name),
      query: parseSavedScreenerQuery(input.query),
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
    }
  } catch {
    return null
  }
}

export function parseSavedScreenerScreens(value: unknown): SavedScreenerScreen[] {
  const input = record(value)
  const rows = Array.isArray(input.screens) ? input.screens : []
  const seen = new Set<string>()
  return rows.flatMap((row) => {
    const screen = parseSavedScreen(row)
    if (!screen || seen.has(screen.id) || seen.size >= MAX_SAVED_SCREENS) return []
    seen.add(screen.id)
    return [screen]
  })
}

export function screenQueryFromCurrent(query: SavedScreenerQuery): SavedScreenerQuery {
  return parseSavedScreenerQuery(query)
}
