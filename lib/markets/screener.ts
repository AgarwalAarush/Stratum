import { ILLUSTRATIVE_SCREENER_ROWS } from './screener-fixtures.ts'
import type {
  ScreenerFilter,
  ScreenerFilterField,
  ScreenerFilterOperator,
  ScreenerPreset,
  ScreenerQuery,
  ScreenerResponse,
  ScreenerRow,
  ScreenerSortField,
} from './types.ts'

const PRESETS: ScreenerPreset[] = ['momentum', 'unusual-volume', 'near-highs', 'gap-movers']
const FILTER_FIELDS: ScreenerFilterField[] = ['price', 'dailyChange', 'gap', 'volume', 'relativeVolume', 'above50DayAverage', 'fiftyTwoWeekPosition', 'exchange', 'tradable']
const FILTER_OPERATORS: ScreenerFilterOperator[] = ['gt', 'gte', 'lt', 'lte', 'eq']
const SORT_FIELDS: ScreenerSortField[] = ['symbol', 'price', 'dailyChange', 'gap', 'volume', 'relativeVolume', 'fiftyDayAverage', 'fiftyTwoWeekPosition']

export const DEFAULT_SCREENER_FILTERS: ScreenerFilter[] = [
  { id: 'price-min', field: 'price', operator: 'gt', value: 10, label: 'Price > $10' },
  { id: 'change-min', field: 'dailyChange', operator: 'gt', value: 2, label: 'Daily change > 2%' },
  { id: 'relative-volume-min', field: 'relativeVolume', operator: 'gt', value: 1.5, label: 'Relative volume > 1.5×' },
  { id: 'above-50-day', field: 'above50DayAverage', operator: 'eq', value: true, label: 'Above 50D MA' },
  { id: 'tradable', field: 'tradable', operator: 'eq', value: true, label: 'Tradable' },
]

export const DEFAULT_SCREENER_QUERY: ScreenerQuery = {
  preset: 'momentum',
  filters: DEFAULT_SCREENER_FILTERS,
  sort: 'relativeVolume',
  direction: 'desc',
  page: 1,
  pageSize: 10,
}

export class ScreenerValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ScreenerValidationError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseFilter(value: unknown, index: number): ScreenerFilter {
  if (!isRecord(value)) throw new ScreenerValidationError(`filters[${index}] must be an object`)
  if (typeof value.id !== 'string' || value.id.length === 0) throw new ScreenerValidationError(`filters[${index}].id is required`)
  if (!FILTER_FIELDS.includes(value.field as ScreenerFilterField)) throw new ScreenerValidationError(`filters[${index}].field is not supported`)
  if (!FILTER_OPERATORS.includes(value.operator as ScreenerFilterOperator)) throw new ScreenerValidationError(`filters[${index}].operator is not supported`)
  if (!['number', 'string', 'boolean'].includes(typeof value.value)) throw new ScreenerValidationError(`filters[${index}].value is invalid`)
  if (typeof value.label !== 'string' || value.label.length === 0) throw new ScreenerValidationError(`filters[${index}].label is required`)

  return value as unknown as ScreenerFilter
}

export function parseScreenerQuery(value: unknown): ScreenerQuery {
  if (!isRecord(value)) throw new ScreenerValidationError('Request body must be an object')
  if (!PRESETS.includes(value.preset as ScreenerPreset)) throw new ScreenerValidationError('preset is not supported')
  if (!Array.isArray(value.filters) || value.filters.length > 12) throw new ScreenerValidationError('filters must contain at most 12 conditions')
  if (!SORT_FIELDS.includes(value.sort as ScreenerSortField)) throw new ScreenerValidationError('sort is not supported')
  if (value.direction !== 'asc' && value.direction !== 'desc') throw new ScreenerValidationError('direction must be asc or desc')
  if (!Number.isInteger(value.page) || (value.page as number) < 1) throw new ScreenerValidationError('page must be a positive integer')
  if (!Number.isInteger(value.pageSize) || (value.pageSize as number) < 1 || (value.pageSize as number) > 50) throw new ScreenerValidationError('pageSize must be between 1 and 50')

  return {
    preset: value.preset as ScreenerPreset,
    filters: value.filters.map(parseFilter),
    sort: value.sort as ScreenerSortField,
    direction: value.direction,
    page: value.page as number,
    pageSize: value.pageSize as number,
  }
}

function comparableValue(row: ScreenerRow, field: ScreenerFilterField): number | string | boolean {
  if (field === 'above50DayAverage') return row.price > row.fiftyDayAverage
  return row[field]
}

function matchesFilter(row: ScreenerRow, filter: ScreenerFilter): boolean {
  const actual = comparableValue(row, filter.field)
  const expected = filter.value

  if (filter.operator === 'eq') return actual === expected
  if (typeof actual !== 'number' || typeof expected !== 'number') return false
  if (filter.operator === 'gt') return actual > expected
  if (filter.operator === 'gte') return actual >= expected
  if (filter.operator === 'lt') return actual < expected
  return actual <= expected
}

function sortValue(row: ScreenerRow, field: ScreenerSortField): number | string {
  return row[field]
}

export function runIllustrativeScreener(query: ScreenerQuery): ScreenerResponse {
  const filtered = ILLUSTRATIVE_SCREENER_ROWS.filter((row) => query.filters.every((filter) => matchesFilter(row, filter)))
  filtered.sort((left, right) => {
    const a = sortValue(left, query.sort)
    const b = sortValue(right, query.sort)
    const comparison = typeof a === 'string' && typeof b === 'string' ? a.localeCompare(b) : Number(a) - Number(b)
    return query.direction === 'asc' ? comparison : -comparison
  })

  const start = (query.page - 1) * query.pageSize
  return {
    rows: filtered.slice(start, start + query.pageSize),
    total: filtered.length,
    page: query.page,
    pageSize: query.pageSize,
    feed: 'illustrative',
    dataAsOf: '2026-07-15T20:00:00.000Z',
    snapshotId: 'illustrative-2026-07-15-close',
    stale: false,
  }
}
