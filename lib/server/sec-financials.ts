import type { SecLiquiditySnapshot } from '../markets/financial-reconciliation.ts'

interface SecFactUnit {
  end?: string
  filed?: string
  form?: string
  val?: number
}

interface SecCompanyFacts {
  facts?: Record<string, Record<string, { units?: Record<string, SecFactUnit[]> }>>
}

function latestUsdFact(
  facts: SecCompanyFacts,
  names: string[],
): Array<{ asOf: string; value: number }> {
  const values = names.flatMap((name) => Object.values(facts.facts ?? {})
    .flatMap((taxonomy) => taxonomy[name]?.units?.USD ?? []))
    .flatMap((fact) =>
      typeof fact.end === 'string'
        && typeof fact.val === 'number'
        && ['10-K', '10-Q'].includes(fact.form ?? '')
        ? [{ asOf: fact.end, value: fact.val, filed: fact.filed ?? '' }]
        : [])
    .sort((left, right) => right.filed.localeCompare(left.filed))
  const byPeriod = new Map<string, number>()
  for (const value of values) {
    if (!byPeriod.has(value.asOf)) byPeriod.set(value.asOf, value.value)
  }
  return [...byPeriod.entries()].map(([asOf, value]) => ({ asOf, value }))
}

export function parseSecLiquidityFacts(payload: unknown, sourceUrl: string): SecLiquiditySnapshot[] {
  const facts = payload as SecCompanyFacts
  const cash = latestUsdFact(facts, ['CashAndCashEquivalentsAtCarryingValue'])
  const investments = latestUsdFact(facts, ['ShortTermInvestments'])
  const longTermDebt = latestUsdFact(facts, [
    'A2030ConvertibleNotes',
    'ConvertibleDebtNoncurrent',
    'LongTermDebtAndFinanceLeaseObligationsNoncurrent',
    'LongTermDebtNoncurrent',
  ])
  const currentDebt = latestUsdFact(facts, [
    'LongTermDebtCurrent',
    'LongTermDebtAndFinanceLeaseObligationsCurrent',
    'ShortTermBorrowings',
  ])
  const cashByPeriod = new Map(cash.map((item) => [item.asOf, item.value]))
  const investmentsByPeriod = new Map(investments.map((item) => [item.asOf, item.value]))
  const longTermDebtByPeriod = new Map(longTermDebt.map((item) => [item.asOf, item.value]))
  const currentDebtByPeriod = new Map(currentDebt.map((item) => [item.asOf, item.value]))
  return [...new Set([
    ...cashByPeriod.keys(),
    ...investmentsByPeriod.keys(),
    ...longTermDebtByPeriod.keys(),
    ...currentDebtByPeriod.keys(),
  ])]
    .sort((left, right) => right.localeCompare(left))
    .map((asOf) => ({
      asOf,
      cashAndCashEquivalents: cashByPeriod.get(asOf) ?? null,
      shortTermInvestments: investmentsByPeriod.get(asOf) ?? null,
      grossDebt: (longTermDebtByPeriod.get(asOf) ?? null) !== null && (currentDebtByPeriod.get(asOf) ?? null) !== null
        ? (longTermDebtByPeriod.get(asOf) ?? 0) + (currentDebtByPeriod.get(asOf) ?? 0)
        : longTermDebtByPeriod.get(asOf) ?? currentDebtByPeriod.get(asOf) ?? null,
      sourceUrl,
    }))
}

export async function fetchSecLiquidityFacts(cikValue: unknown): Promise<SecLiquiditySnapshot[]> {
  const cik = String(cikValue ?? '').replace(/\D/g, '')
  if (!cik) return []
  const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik.padStart(10, '0')}.json`
  const response = await fetch(url, {
    signal: AbortSignal.timeout(12_000),
    headers: {
      Accept: 'application/json',
      'User-Agent': process.env.SEC_API_USER_AGENT?.trim() || 'Stratum/0.3 (aarushagarwal.dev)',
    },
  })
  if (!response.ok) throw new Error(`SEC companyfacts request failed (${response.status})`)
  return parseSecLiquidityFacts(await response.json(), url)
}
