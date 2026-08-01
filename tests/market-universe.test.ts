import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { strToU8, zipSync } from 'fflate'
import type { MarketAsset } from '../lib/markets/types.ts'
import {
  MARKET_THEME_SYMBOLS,
  selectExpandedUniverseAssets,
} from '../lib/markets/investable-universe.ts'
import {
  IWM_HOLDINGS_URL,
  MARKET_BENCHMARK_SYMBOLS,
  MIN_RUSSELL_2000_ASSETS,
  MIN_SP500_ASSETS,
  RUSSELL_2000_UNIVERSE_NAME,
  parseIwmHoldingsCsv,
  parseSpyHoldingsWorkbook,
  selectMarketUniverseAssets,
} from '../lib/server/market-universe.ts'

function workbookWithSymbols(symbols: string[]): Uint8Array {
  const strings = ['Ticker', ...symbols]
  const shared = `<sst>${strings.map((value) => `<si><t>${value}</t></si>`).join('')}</sst>`
  const rows = [
    '<row r="5"><c r="B5" t="s"><v>0</v></c></row>',
    ...symbols.map((_, index) => `<row r="${index + 6}"><c r="B${index + 6}" t="s"><v>${index + 1}</v></c></row>`),
  ]
  return zipSync({
    'xl/sharedStrings.xml': strToU8(shared),
    'xl/worksheets/sheet1.xml': strToU8(`<worksheet><sheetData>${rows.join('')}</sheetData></worksheet>`),
  })
}

function iwmCsvWithSymbols(symbols: string[]): string {
  return [
    'iShares Russell 2000 ETF',
    'Fund Holdings as of,"Jul 29, 2026"',
    'Ticker,Name,Sector,Asset Class,Market Value,Weight (%),Exchange,Currency',
    ...symbols.map((symbol) => `"${symbol}","${symbol}, Inc.","Technology","Equity","1,000","0.01","NASDAQ","USD"`),
    '"XTSLA","Cash Fund","Cash and/or Derivatives","Money Market","1,000","0.01","-","USD"',
  ].join('\n')
}

test('SPY workbook parser extracts a complete constituent universe', () => {
  const symbols = Array.from({ length: MIN_SP500_ASSETS }, (_, index) => `T${index}`)
  symbols[0] = 'BRK.B'
  const parsed = parseSpyHoldingsWorkbook(workbookWithSymbols(symbols))

  assert.equal(parsed.length, MIN_SP500_ASSETS)
  assert.ok(parsed.includes('BRK.B'))
})

test('SPY workbook parser rejects incomplete source data', () => {
  assert.throws(() => parseSpyHoldingsWorkbook(workbookWithSymbols(['AAPL', 'MSFT'])), /only 2 eligible symbols/)
})

test('IWM CSV parser extracts Russell 2000 equity holdings and source date', () => {
  const symbols = Array.from({ length: MIN_RUSSELL_2000_ASSETS }, (_, index) => `R${index}`)
  const parsed = parseIwmHoldingsCsv(iwmCsvWithSymbols(symbols))

  assert.equal(parsed.symbols.length, MIN_RUSSELL_2000_ASSETS)
  assert.ok(parsed.symbols.includes('R0'))
  assert.equal(parsed.sourceAsOf, '2026-07-29T00:00:00.000Z')
  assert.equal(parsed.symbols.includes('XTSLA'), false)
})

test('IWM CSV parser rejects incomplete Russell 2000 source data', () => {
  assert.throws(() => parseIwmHoldingsCsv(iwmCsvWithSymbols(['BTSG', 'MOGA'])), /only 2 eligible symbols/)
})

test('market universe includes S&P 500 and tracked assets only once', () => {
  const asset = (symbol: string, active = true, tradable = true): MarketAsset => ({
    symbol,
    name: symbol,
    exchange: 'NASDAQ',
    assetClass: 'us_equity',
    active,
    tradable,
  })
  const assets = [asset('AAPL'), asset('MSFT'), asset('PLTR'), asset('OLD', false), asset('LOCKED', true, false)]
  const selected = selectMarketUniverseAssets(assets, ['AAPL', 'MSFT'], ['PLTR', 'AAPL', 'OLD', 'LOCKED'])

  assert.deepEqual(selected.map((item) => item.symbol), ['AAPL', 'MSFT', 'PLTR'])
})

test('market universe always carries the overview benchmark instruments', () => {
  assert.deepEqual(MARKET_BENCHMARK_SYMBOLS, ['SPY', 'QQQ', 'IWM', 'TLT', 'UUP', 'USO'])
  assert.equal(RUSSELL_2000_UNIVERSE_NAME, 'russell-2000')
  assert.match(IWM_HOLDINGS_URL, /ishares-russell-2000-etf\/latest-holdings\.csv/)
})

test('expanded universe selects liquid non-index names and always retains themes', () => {
  const asset = (symbol: string, name = `${symbol} Common Stock`, exchange = 'NASDAQ'): MarketAsset => ({
    symbol,
    name,
    exchange,
    assetClass: 'us_equity',
    active: true,
    tradable: true,
  })
  const assets = [
    asset('AAPL'),
    asset('ARM', 'Arm Holdings plc American Depositary Shares'),
    asset('CRDO'),
    asset('JUNK-W', 'Junk Holdings Warrants'),
  ]
  const snapshot = (symbol: string, price: number, volume: number) => ({
    symbol,
    price,
    previousClose: price,
    open: price,
    high: price,
    low: price,
    volume,
    asOf: '2026-07-30T20:00:00.000Z',
    feed: 'iex' as const,
  })
  const selected = selectExpandedUniverseAssets(
    assets,
    [
      snapshot('AAPL', 200, 1_000_000),
      snapshot('ARM', 150, 200_000),
      snapshot('CRDO', 80, 150_000),
      snapshot('JUNK-W', 10, 2_000_000),
    ],
    ['ARM'],
    { targetCount: 3 },
  )

  assert.deepEqual(new Set(selected.map((item) => item.symbol)), new Set(['AAPL', 'ARM', 'CRDO']))
  assert.ok(MARKET_THEME_SYMBOLS.includes('ARM'))
  assert.ok(MARKET_THEME_SYMBOLS.includes('TSM'))
})

test('resolved universe loads both watchlisted and manually owned symbols', () => {
  const source = readFileSync(join(process.cwd(), 'lib/server/market-universe.ts'), 'utf8')
  assert.match(source, /from\('market_watchlist_items'\)\.select\('symbol'\)/)
  assert.match(source, /from\('manual_positions'\)\.select\('symbol'\)/)
  assert.match(source, /from\('portfolio_transactions'\)\.select\('symbol,action'\)/)
  assert.match(source, /investment_theses/)
  assert.match(source, /SEARCH_COVERAGE_UNIVERSE_NAME/)
  assert.match(source, /search-coverage/)
  assert.match(source, /requestMarketCoverage/)
  assert.match(source, /resolveRussell2000Symbols/)
  assert.match(source, /\.\.\.russell2000Symbols/)
  assert.match(source, /\.range\(from, from \+ DATABASE_PAGE_SIZE - 1\)/)
})

test('market universe migrations keep membership private and foreign keys indexed', () => {
  const migration = readFileSync(join(process.cwd(), 'supabase/migrations/202607150003_market_universes_and_watchlists.sql'), 'utf8')
  const indexes = readFileSync(join(process.cwd(), 'supabase/migrations/202607150004_market_universe_foreign_key_indexes.sql'), 'utf8')

  assert.match(migration, /alter table public\.market_universe_members enable row level security/)
  assert.match(migration, /alter table public\.market_watchlist_items enable row level security/)
  assert.match(migration, /grant execute on function public\.replace_market_universe[\s\S]*to service_role/)
  assert.match(indexes, /market_universe_members_symbol/)
  assert.match(indexes, /market_watchlist_items_symbol/)
})
