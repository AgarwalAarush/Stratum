/** Exact reported fields only. No model-created metric aliases or inferred
 * quarterly/annual conversion is allowed in automatic outcome resolution. */
export const COMPANY_FORECAST_METRICS = {
  'FMP:incomeQuarterly:revenue': ['incomeQuarterly', 'revenue'],
  'FMP:incomeQuarterly:operatingIncome': ['incomeQuarterly', 'operatingIncome'],
  'FMP:incomeQuarterly:netIncome': ['incomeQuarterly', 'netIncome'],
  'FMP:cashFlowQuarterly:operatingCashFlow': ['cashFlowQuarterly', 'operatingCashFlow'],
  'FMP:cashFlowQuarterly:freeCashFlow': ['cashFlowQuarterly', 'freeCashFlow'],
} as const

export function companyForecastObservations(metric: string, packets: Array<{ id: string; generated_at: string; packet: unknown }>) {
  if (!Object.hasOwn(COMPANY_FORECAST_METRICS, metric)) return []
  const [statement, field] = COMPANY_FORECAST_METRICS[metric as keyof typeof COMPANY_FORECAST_METRICS]
  return packets.flatMap(p => {
    const packet = p.packet as { financialStatements?: Record<string, unknown>; symbol?: string }
    const rows = packet?.financialStatements?.[statement]
    if (!Array.isArray(rows)) return []
    return rows.flatMap((r: Record<string, unknown>) => {
      if (typeof r[field] !== 'number' || !Number.isFinite(r[field]) || typeof r.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.date) || typeof r.reportedCurrency !== 'string' || !r.reportedCurrency) return []
      const endpoint = statement === 'incomeQuarterly' ? 'income-statement' : 'cash-flow-statement'
      return [{ id: p.id, metric, value: r[field] as number, period: r.date, unit: r.reportedCurrency,
        availableAt: p.generated_at, sourceUrl: `https://financialmodelingprep.com/stable/${endpoint}?symbol=${encodeURIComponent(packet.symbol ?? '')}&period=quarter` }]
    })
  })
}
