import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { strToU8, zipSync } from 'fflate'
import type { MarketAsset } from '../lib/markets/types.ts'
import {
  MARKET_BENCHMARK_SYMBOLS,
  MIN_SP500_ASSETS,
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

test('market universe includes S&P 500 and watchlist assets only once', () => {
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
