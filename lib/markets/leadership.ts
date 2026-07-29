import type {
  MarketDivergenceSignal,
  MarketGroupMetric,
  MarketLeadershipSnapshot,
  StockLeadershipMetric,
} from './types.ts'

export interface LeadershipPriceBar {
  symbol: string
  tradingDate: string
  close: number
}

export interface LeadershipCompany {
  symbol: string
  company: string
  sector: string
  subIndustry: string
}

export interface BuildLeadershipOptions {
  id?: string
  generatedAt?: string
  relativeVolumeBySymbol?: ReadonlyMap<string, number>
}

function percent(now: number, then: number | null | undefined): number | null {
  return then !== null && then !== undefined && then !== 0 ? rounded((now / then - 1) * 100) : null
}

function rounded(value: number): number {
  return Math.round(value * 100) / 100
}

function average(values: Array<number | null>): number | null {
  const finite = values.filter((value): value is number => value !== null && Number.isFinite(value))
  return finite.length > 0 ? rounded(finite.reduce((sum, value) => sum + value, 0) / finite.length) : null
}

function nearestClose(
  bars: LeadershipPriceBar[],
  target: Date,
): number | null {
  let best: LeadershipPriceBar | null = null
  let bestDistance = Number.POSITIVE_INFINITY
  for (const bar of bars) {
    const barTime = Date.parse(`${bar.tradingDate}T00:00:00.000Z`)
    const distance = Math.abs(barTime - target.getTime())
    const bestTime = best ? Date.parse(`${best.tradingDate}T00:00:00.000Z`) : Number.POSITIVE_INFINITY
    if (distance < bestDistance || (distance === bestDistance && barTime <= target.getTime() && bestTime > target.getTime())) {
      best = bar
      bestDistance = distance
    }
  }
  return best?.close ?? null
}

function stockMetric(
  company: LeadershipCompany,
  bars: LeadershipPriceBar[],
  asOfDate: string,
  relativeVolume: number | null,
): StockLeadershipMetric | null {
  const ordered = [...bars].sort((left, right) => right.tradingDate.localeCompare(left.tradingDate))
  if (ordered.length < 2) return null
  const current = ordered[0]!.close
  const today = new Date(`${asOfDate}T00:00:00.000Z`)
  const target30 = new Date(today)
  target30.setUTCDate(target30.getUTCDate() - 30)
  const target1y = new Date(today)
  target1y.setUTCDate(target1y.getUTCDate() - 365)
  const mean = (count: number) => ordered.length >= count
    ? ordered.slice(0, count).reduce((sum, bar) => sum + bar.close, 0) / count
    : null

  return {
    symbol: company.symbol,
    company: company.company,
    sector: company.sector || 'Unknown',
    subIndustry: company.subIndustry || 'Unknown',
    price: current,
    dayReturn: percent(current, ordered[1]?.close),
    return30d: percent(current, nearestClose(ordered, target30)),
    return50d: percent(current, ordered[50]?.close),
    return200d: percent(current, ordered[200]?.close),
    return1y: percent(current, nearestClose(ordered, target1y)),
    vs50DayAverage: percent(current, mean(50)),
    vs200DayAverage: percent(current, mean(200)),
    relativeVolume,
    observationCount: ordered.length,
    asOf: `${ordered[0]!.tradingDate}T20:00:00.000Z`,
  }
}

export function aggregateLeadershipGroups(
  stocks: StockLeadershipMetric[],
  groupType: MarketGroupMetric['groupType'],
): MarketGroupMetric[] {
  const grouped = new Map<string, StockLeadershipMetric[]>()
  for (const stock of stocks) {
    const label = groupType === 'sector' ? stock.sector : stock.subIndustry
    const key = groupType === 'sector' ? label : `${stock.sector}\u0000${label}`
    grouped.set(key, [...(grouped.get(key) ?? []), stock])
  }

  return [...grouped.values()].map((rows) => ({
    groupType,
    label: groupType === 'sector' ? rows[0]!.sector : rows[0]!.subIndustry,
    sector: groupType === 'sector' ? null : rows[0]!.sector,
    constituentCount: rows.length,
    return30d: average(rows.map((row) => row.return30d)),
    return50d: average(rows.map((row) => row.return50d)),
    return200d: average(rows.map((row) => row.return200d)),
    return1y: average(rows.map((row) => row.return1y)),
    vs50DayAverage: average(rows.map((row) => row.vs50DayAverage)),
    vs200DayAverage: average(rows.map((row) => row.vs200DayAverage)),
  }))
}

function buildDivergences(
  stocks: StockLeadershipMetric[],
  groups: MarketGroupMetric[],
): MarketDivergenceSignal[] {
  const result: MarketDivergenceSignal[] = []
  const groupByName = new Map(groups.map((group) => [`${group.sector}\u0000${group.label}`, group]))

  for (const group of groups) {
    if (group.return30d === null || group.return1y === null || group.return30d * group.return1y >= 0) continue
    const spread = rounded(group.return30d - group.return1y)
    result.push({
      id: `group:${group.sector}:${group.label}`,
      scope: 'near_vs_long_term',
      symbol: null,
      groupLabel: group.label,
      nearTermReturn: group.return30d,
      longTermReturn: group.return1y,
      spread,
      summary: `${group.label} is ${group.return30d >= 0 ? 'rebounding' : 'cooling'} over 30 days against its one-year trend.`,
    })
  }

  for (const stock of stocks) {
    if (stock.return30d === null) continue
    const group = groupByName.get(`${stock.sector}\u0000${stock.subIndustry}`)
    if (!group || group.return30d === null) continue
    const spread = rounded(stock.return30d - group.return30d)
    if (Math.abs(spread) < 10) continue
    result.push({
      id: `stock:${stock.symbol}:${stock.subIndustry}`,
      scope: 'stock_vs_group',
      symbol: stock.symbol,
      groupLabel: stock.subIndustry,
      nearTermReturn: stock.return30d,
      longTermReturn: group.return30d,
      spread,
      summary: `${stock.symbol} is ${Math.abs(spread).toFixed(1)}pp ${spread > 0 ? 'ahead of' : 'behind'} its sub-industry over 30 days.`,
    })
  }

  return result
    .sort((left, right) => Math.abs(right.spread) - Math.abs(left.spread))
    .slice(0, 20)
}

export function buildMarketLeadershipSnapshot(
  companies: LeadershipCompany[],
  bars: LeadershipPriceBar[],
  options: BuildLeadershipOptions = {},
): MarketLeadershipSnapshot {
  if (companies.length === 0 || bars.length === 0) throw new Error('Leadership requires a universe and price history')
  const barsBySymbol = new Map<string, LeadershipPriceBar[]>()
  for (const bar of bars) barsBySymbol.set(bar.symbol, [...(barsBySymbol.get(bar.symbol) ?? []), bar])
  const latestDate = bars.reduce((latest, bar) => bar.tradingDate > latest ? bar.tradingDate : latest, bars[0]!.tradingDate)
  const stocks = companies.flatMap((company) => {
    const metric = stockMetric(
      company,
      barsBySymbol.get(company.symbol) ?? [],
      latestDate,
      options.relativeVolumeBySymbol?.get(company.symbol) ?? null,
    )
    return metric ? [metric] : []
  })
  if (stocks.length === 0) throw new Error('No company has sufficient price history for leadership')

  const sectors = aggregateLeadershipGroups(stocks, 'sector')
    .sort((left, right) => (right.return1y ?? -Infinity) - (left.return1y ?? -Infinity))
  const subIndustries = aggregateLeadershipGroups(stocks, 'sub_industry')
    .filter((group) => group.constituentCount >= 2)
    .sort((left, right) => (right.return1y ?? -Infinity) - (left.return1y ?? -Infinity))
  const ranked = [...stocks].sort((left, right) => (right.return30d ?? -Infinity) - (left.return30d ?? -Infinity))
  const freshCount = stocks.filter((stock) => stock.asOf.startsWith(latestDate)).length

  return {
    id: options.id ?? `leadership-${latestDate}`,
    tradingDate: latestDate,
    dataAsOf: `${latestDate}T20:00:00.000Z`,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    universeCount: companies.length,
    usableCount: stocks.length,
    freshCount,
    advancingPercent: rounded((stocks.filter((stock) => (stock.dayReturn ?? 0) > 0).length / stocks.length) * 100),
    above50DayPercent: rounded((stocks.filter((stock) => (stock.vs50DayAverage ?? -Infinity) > 0).length / stocks.length) * 100),
    sectors,
    subIndustries,
    stocks,
    leaders: ranked.slice(0, 10),
    laggards: ranked.slice(-10).reverse(),
    divergences: buildDivergences(stocks, subIndustries),
  }
}
