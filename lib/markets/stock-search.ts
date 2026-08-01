export interface SearchableStock {
  symbol: string
  company: string
}

export interface StockSearchResult extends SearchableStock {
  exchange: string
  price: number
  dailyChange: number
  asOf: string
}

function normalized(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, ' ')
}

function matchScore(stock: SearchableStock, query: string): number {
  const symbol = normalized(stock.symbol)
  const company = normalized(stock.company)
  if (symbol === query) return 1_000
  if (symbol.startsWith(query)) return 900
  if (symbol.includes(query)) return 800
  if (company.startsWith(query)) return 700
  if (company.split(/[^A-Z0-9]+/).some((word) => word.startsWith(query))) return 600
  if (company.includes(query)) return 500
  return 0
}

/** Ticker intent wins over company-name matches in the Markets command search. */
export function rankStockSearchResults<T extends SearchableStock>(stocks: T[], input: string, limit = 8): T[] {
  const query = normalized(input)
  if (!query || limit < 1) return []
  return stocks
    .map((stock) => ({ stock, score: matchScore(stock, query) }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.stock.symbol.localeCompare(right.stock.symbol))
    .slice(0, limit)
    .map(({ stock }) => stock)
}
