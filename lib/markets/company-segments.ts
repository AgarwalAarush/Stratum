import type { CompanySegmentPeriod } from './types.ts'

const METADATA_KEYS = new Set([
  'symbol',
  'date',
  'fillingdate',
  'filingdate',
  'accepteddate',
  'fiscalyear',
  'calendaryear',
  'period',
  'reportedcurrency',
  'currency',
  'link',
  'finallink',
])

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function finiteNumber(value: unknown): number | null {
  const parsed = typeof value === 'string' ? Number(value.replaceAll(',', '')) : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function humanizeSegmentLabel(value: string): string {
  return value
    .replaceAll('_', ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((word) => word === word.toUpperCase()
      ? word
      : `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(' ')
}

function valuesFromObject(value: unknown): CompanySegmentPeriod['values'] {
  return Object.entries(record(value))
    .flatMap(([label, rawValue]) => {
      const revenue = finiteNumber(rawValue)
      if (revenue === null || revenue < 0 || METADATA_KEYS.has(label.toLowerCase())) return []
      return [{ label: humanizeSegmentLabel(label), revenue }]
    })
}

function valuesFromArray(value: unknown): CompanySegmentPeriod['values'] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const row = record(item)
    const label = row.label ?? row.name ?? row.segment ?? row.product ?? row.region
    const revenue = finiteNumber(row.revenue ?? row.value ?? row.amount)
    return typeof label === 'string' && revenue !== null && revenue >= 0
      ? [{ label: humanizeSegmentLabel(label), revenue }]
      : []
  })
}

function segmentValues(row: Record<string, unknown>): CompanySegmentPeriod['values'] {
  const nestedCandidates = [
    row.data,
    row.segments,
    row.segmentData,
    row.productSegments,
    row.geographicSegments,
    row.revenueSegments,
  ]
  for (const candidate of nestedCandidates) {
    const values = Array.isArray(candidate)
      ? valuesFromArray(candidate)
      : valuesFromObject(candidate)
    if (values.length > 0) return values
  }
  return valuesFromObject(row)
}

function periodSortValue(period: CompanySegmentPeriod): number {
  const timestamp = Date.parse(period.date)
  if (Number.isFinite(timestamp)) return timestamp
  const year = Number.parseInt(period.fiscalYear ?? '', 10)
  const quarter = Number.parseInt(period.period?.replace(/\D/g, '') ?? '', 10)
  return (Number.isFinite(year) ? year : 0) * 10 + (Number.isFinite(quarter) ? quarter : 5)
}

export function normalizeCompanySegmentPeriods(payload: unknown): CompanySegmentPeriod[] {
  const rows = Array.isArray(payload) ? payload : [payload]
  return rows
    .map(record)
    .map((row) => ({
      date: String(row.date ?? row.filingDate ?? row.fillingDate ?? ''),
      fiscalYear: String(row.fiscalYear ?? row.calendarYear ?? '') || null,
      period: String(row.period ?? '') || null,
      reportedCurrency: String(row.reportedCurrency ?? row.currency ?? '') || null,
      values: segmentValues(row)
        .sort((left, right) => right.revenue - left.revenue),
    }))
    .filter((period) => period.values.length > 0)
    .sort((left, right) => periodSortValue(right) - periodSortValue(left))
}
