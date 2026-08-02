export type FinancialRecord = Record<string, string | number | boolean | null>

export interface SecLiquiditySnapshot {
  asOf: string
  cashAndCashEquivalents: number | null
  shortTermInvestments: number | null
  grossDebt: number | null
  sourceUrl: string
}

export interface FinancialReconciliation {
  asOf: string
  cashAndCashEquivalents: number | null
  shortTermInvestments: number | null
  totalLiquidity: number | null
  grossDebt: number | null
  netCash: number | null
  operatingCashFlow: number | null
  capitalExpenditure: number | null
  providerFreeCashFlow: number | null
  calculatedFreeCashFlow: number | null
  liquiditySource: 'sec_edgar' | 'fmp'
  warnings: string[]
}

function numeric(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function valueAt(record: FinancialRecord | undefined, keys: string[]): number | null {
  if (!record) return null
  for (const key of keys) {
    const value = numeric(record[key])
    if (value !== null) return value
  }
  return null
}

function statementDate(record: FinancialRecord | undefined): string | null {
  const value = record?.date ?? record?.fillingDate ?? record?.acceptedDate
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null
}

function newestRecord(records: FinancialRecord[]): FinancialRecord | undefined {
  return [...records].sort((left, right) =>
    (statementDate(right) ?? '').localeCompare(statementDate(left) ?? ''))[0]
}

function secForPeriod(
  snapshots: SecLiquiditySnapshot[],
  asOf: string | null,
): SecLiquiditySnapshot | null {
  if (!asOf) return null
  return snapshots.find((snapshot) => snapshot.asOf === asOf) ?? null
}

/**
 * Creates one same-period balance-sheet bridge before the model sees financial
 * statements. Positive netCash means net cash; negative netCash means net debt.
 */
export function reconcileFinancials(
  balanceRows: FinancialRecord[],
  cashFlowRows: FinancialRecord[],
  secLiquidity: SecLiquiditySnapshot[] = [],
): FinancialReconciliation | null {
  const balance = newestRecord(balanceRows)
  if (!balance) return null
  const asOf = statementDate(balance)
  if (!asOf) return null
  const sec = secForPeriod(secLiquidity, asOf)
  const fmpCash = valueAt(balance, ['cashAndCashEquivalents', 'cashAndCashEquivalentsAtCarryingValue'])
  const fmpShortTermInvestments = valueAt(balance, ['shortTermInvestments'])
  const fmpLiquidity = valueAt(balance, ['cashAndShortTermInvestments'])
    ?? (fmpCash !== null && fmpShortTermInvestments !== null ? fmpCash + fmpShortTermInvestments : null)
  const cashAndCashEquivalents = sec?.cashAndCashEquivalents ?? fmpCash
  const shortTermInvestments = sec?.shortTermInvestments ?? fmpShortTermInvestments
  const totalLiquidity = cashAndCashEquivalents !== null && shortTermInvestments !== null
    ? cashAndCashEquivalents + shortTermInvestments
    : fmpLiquidity
  const fmpGrossDebt = valueAt(balance, ['totalDebt'])
    ?? (() => {
      const shortTermDebt = valueAt(balance, ['shortTermDebt', 'currentDebt'])
      const longTermDebt = valueAt(balance, ['longTermDebt', 'longTermDebtNoncurrent'])
      return shortTermDebt !== null && longTermDebt !== null ? shortTermDebt + longTermDebt : longTermDebt
    })()
  const grossDebt = sec?.grossDebt ?? fmpGrossDebt
  const cashFlow = newestRecord(cashFlowRows)
  const operatingCashFlow = valueAt(cashFlow, ['operatingCashFlow'])
  const capitalExpenditureRaw = valueAt(cashFlow, ['capitalExpenditure'])
  const capitalExpenditure = capitalExpenditureRaw === null ? null : Math.abs(capitalExpenditureRaw)
  const warnings: string[] = []
  if (sec && fmpLiquidity !== null && totalLiquidity !== null && Math.abs(fmpLiquidity - totalLiquidity) > Math.max(1_000_000, totalLiquidity * 0.01)) {
    warnings.push('FMP liquidity does not reconcile to the same-period SEC cash and short-term-investment facts.')
  }
  if (sec?.grossDebt !== null && sec?.grossDebt !== undefined && fmpGrossDebt !== null
    && Math.abs(fmpGrossDebt - sec.grossDebt) > Math.max(1_000_000, sec.grossDebt * 0.01)) {
    warnings.push('FMP gross debt differs from the same-period SEC debt fact; the reconciled position uses the SEC amount.')
  }
  if (grossDebt === null) warnings.push('Interest-bearing debt was unavailable in the normalized balance sheet.')
  return {
    asOf,
    cashAndCashEquivalents,
    shortTermInvestments,
    totalLiquidity,
    grossDebt,
    netCash: totalLiquidity !== null && grossDebt !== null ? totalLiquidity - grossDebt : null,
    operatingCashFlow,
    capitalExpenditure,
    providerFreeCashFlow: valueAt(cashFlow, ['freeCashFlow']),
    calculatedFreeCashFlow: operatingCashFlow !== null && capitalExpenditure !== null
      ? operatingCashFlow - capitalExpenditure
      : null,
    liquiditySource: sec ? 'sec_edgar' : 'fmp',
    warnings,
  }
}
