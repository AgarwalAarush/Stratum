import type { MarketDailyBar, MarketFeed } from '../markets/types.ts'
export type OutcomePriceRequest = {symbols: string[]; start: string; end: string; feed?: Exclude<MarketFeed,'illustrative'>; adjustment: 'all'|'raw'}
type BarsResult = {data: MarketDailyBar[]; feed: Exclude<MarketFeed,'illustrative'>}
/** Coalesce securities and date ranges under one feed/adjustment contract.
 * Requests receive their own bounded view, never another task's future bars. */
export function outcomePriceBatch(requests: OutcomePriceRequest[], fetch: (symbols: string[], start: string, end: string, feed: OutcomePriceRequest['feed'], adjustment: 'all'|'raw') => Promise<BarsResult>, persist: (result: BarsResult, adjustment: 'all'|'raw') => Promise<void>) {
  const groups = new Map<string, OutcomePriceRequest>()
  const key = (r: OutcomePriceRequest) => `${r.feed ?? 'legacy-default'}:${r.adjustment}`
  for (const request of requests) {
    const old = groups.get(key(request))
    groups.set(key(request), old ? {...old, symbols: [...new Set([...old.symbols, ...request.symbols])], start: old.start < request.start ? old.start : request.start, end: old.end > request.end ? old.end : request.end} : {...request})
  }
  const results = new Map<string, Promise<BarsResult>>()
  return async (request: OutcomePriceRequest): Promise<BarsResult> => {
    const groupKey = key(request)
    if (!results.has(groupKey)) {
      const group = groups.get(groupKey) ?? request
      results.set(groupKey, (async () => {
        const bars: MarketDailyBar[] = []
        let actualFeed: BarsResult['feed'] | null = null
        for (let offset = 0; offset < group.symbols.length; offset += 100) {
          let start = group.start
          while (start <= group.end) {
            const bound = new Date(Date.parse(start) + 365*86400000).toISOString().slice(0,10)
            const end = bound < group.end ? bound : group.end
            const result = await fetch(group.symbols.slice(offset,offset+100), `${start}T00:00:00Z`, `${end}T23:59:59Z`, group.feed, group.adjustment)
            if (group.feed && result.feed !== group.feed) throw new Error('Outcome feed differs from the frozen evaluation contract')
            if (actualFeed && actualFeed !== result.feed) throw new Error('Outcome batches cannot mix feeds')
            actualFeed = result.feed; bars.push(...result.data)
            start = new Date(Date.parse(end)+86400000).toISOString().slice(0,10)
          }
        }
        const result = {data: bars, feed: actualFeed ?? group.feed ?? 'iex' as const}
        await persist(result, group.adjustment)
        return result
      })())
    }
    const result = await results.get(groupKey)!
    return {...result, data: result.data.filter(b => request.symbols.includes(b.symbol) && b.tradingDate >= request.start && b.tradingDate <= request.end)}
  }
}
