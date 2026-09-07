import type { StockLeadershipMetric, StockViewerData } from './types.ts'

type Leadership = Pick<StockLeadershipMetric, 'price' | 'asOf' | 'return30d' | 'return1y' | 'vs50DayAverage' | 'vs200DayAverage' | 'sector' | 'subIndustry'>
type Viewer = Pick<StockViewerData, 'price' | 'dataAsOf' | 'sector' | 'subIndustry'>

/** A delayed leadership calculation cannot override a newer normalized quote.
 * Do not relabel its historical technical metrics with the quote's timestamp. */
export function selectCompanyMarketBasis(leadership: Leadership | null, viewer: Viewer | null, now = new Date()) {
  const valid = (price: number | null | undefined, asOf: string | undefined) =>
    typeof price === 'number' && Number.isFinite(price) && price > 0 &&
    Number.isFinite(Date.parse(asOf ?? '')) && Date.parse(asOf!) <= now.getTime()
  const leadershipValid = valid(leadership?.price, leadership?.asOf)
  const viewerValid = valid(viewer?.price, viewer?.dataAsOf)
  const useViewer = viewerValid && (!leadershipValid || Date.parse(viewer!.dataAsOf) >= Date.parse(leadership!.asOf))
  if (!useViewer && !leadershipValid) throw new Error('No valid dated market price is available for company research')
  const asOf = useViewer ? viewer!.dataAsOf : leadership!.asOf
  const sameSession = leadershipValid && leadership!.asOf.slice(0, 10) === asOf.slice(0, 10)
  return {
    price: useViewer ? viewer!.price : leadership!.price,
    asOf,
    return30d: sameSession ? leadership!.return30d : null,
    return1y: sameSession ? leadership!.return1y : null,
    vs50DayAverage: sameSession ? leadership!.vs50DayAverage : null,
    vs200DayAverage: sameSession ? leadership!.vs200DayAverage : null,
    technicalAsOf: sameSession ? leadership!.asOf : null,
    sector: leadership?.sector ?? viewer?.sector ?? 'Classification pending',
    subIndustry: leadership?.subIndustry ?? viewer?.subIndustry ?? 'Classification pending',
  }
}
