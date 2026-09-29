import type { ExploreData, ExploreView } from '../markets/explore.ts'
import { DEFAULT_SCREENER_QUERY, runIllustrativeScreener } from '../markets/screener.ts'
import type { ScreenerQuery } from '../markets/types.ts'
import { fetchMarketWatchlists } from './market-watchlists.ts'
import { fetchLatestMarketLeadership, fetchLatestScreener, fetchLatestScreenerSymbols } from './markets-repository.ts'

const readers = { screener: fetchLatestScreener, leadership: fetchLatestMarketLeadership, watchlists: fetchMarketWatchlists, symbols: fetchLatestScreenerSymbols }

export async function fetchExploreData(view: ExploreView, ownerId: string, query: ScreenerQuery = DEFAULT_SCREENER_QUERY, sources = readers): Promise<ExploreData> {
  if (view === 'stocks') return { view, query, screener: await sources.screener(query) ?? runIllustrativeScreener(query) }
  if (view !== 'watchlists') {
    const snapshot = await sources.leadership()
    return { view, leadership: snapshot ? {
      tradingDate: snapshot.tradingDate,
      dataAsOf: snapshot.dataAsOf,
      universeCount: snapshot.universeCount,
      usableCount: snapshot.usableCount,
      sectors: view === 'sectors' ? snapshot.sectors : [],
      subIndustries: view === 'sub-industries' ? snapshot.subIndustries : [],
      stocks: snapshot.stocks.map(({ symbol, sector, subIndustry, return30d, asOf }) => ({ symbol, sector, subIndustry, return30d, asOf })),
    } : null }
  }
  const { watchlists, persisted } = await sources.watchlists(ownerId)
  const symbols = [...new Set(watchlists.lists.flatMap(list => list.symbols))]
  const live = await sources.symbols(symbols)
  if (live) return { view, universe: live, watchlists, persisted }
  const fallback = runIllustrativeScreener({ ...DEFAULT_SCREENER_QUERY, filters: [], pageSize: 1_000 })
  const rows = fallback.rows.filter(row => symbols.includes(row.symbol))
  return { view, universe: { ...fallback, rows, total: rows.length, pageSize: rows.length }, watchlists, persisted }
}
