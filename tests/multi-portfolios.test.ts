import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { parsePortfolioUpdate, validatePortfolioUpdate } from '../lib/markets/portfolio-updates.ts'

test('natural-language portfolio updates parse trades and cash movements deterministically', () => {
  const now = new Date('2026-07-31T19:00:00.000Z')
  assert.deepEqual(parsePortfolioUpdate('Buy 10 shares of NVDA at $200', now), {
    action: 'buy', symbol: 'NVDA', quantity: 10, pricePerShare: 200, fees: 0,
    occurredAt: '2026-07-31', notes: 'Buy 10 shares of NVDA at $200',
  })
  assert.deepEqual(parsePortfolioUpdate('Sell 2 AMD @ 490.87 with $1.25 fees on 2026-07-30', now), {
    action: 'sell', symbol: 'AMD', quantity: 2, pricePerShare: 490.87, fees: 1.25,
    occurredAt: '2026-07-30', notes: 'Sell 2 AMD @ 490.87 with $1.25 fees on 2026-07-30',
  })
  assert.deepEqual(parsePortfolioUpdate('Deposit $5k cash', now), {
    action: 'cash_deposit', symbol: null, quantity: null, pricePerShare: 5000, fees: 0,
    occurredAt: '2026-07-31', notes: 'Deposit $5k cash',
  })
  assert.equal(parsePortfolioUpdate('Put money in a good company', now), null)
})

test('portfolio updates require actual capital inputs', () => {
  assert.equal(validatePortfolioUpdate({
    action: 'buy', symbol: 'NVDA', quantity: 0, pricePerShare: 200, fees: 0, occurredAt: '2026-07-31', notes: '',
  }), 'Enter positive shares and price')
})

test('multi-portfolio migration seeds Personal and a separate $100k Dad portfolio', async () => {
  const sql = await readFile(new URL('../supabase/migrations/202607310003_multi_portfolios.sql', import.meta.url), 'utf8')
  assert.match(sql, /create table if not exists public\.portfolios/i)
  assert.match(sql, /create table if not exists public\.portfolio_transactions/i)
  assert.match(sql, /'Personal', 'brokerage'/)
  assert.match(sql, /'Dad & Aarush', 'manual', 100000/)
  assert.match(sql, /'position_import'/)
  assert.match(sql, /'robinhood-holdings-2026-07-30-'/)
})

test('portfolio UI defaults to owned holdings and scopes alerts to the active portfolio', async () => {
  const [component, route, repository] = await Promise.all([
    readFile(new URL('../components/markets/PortfolioWorkspace.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/markets/portfolio/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/server/portfolio.ts', import.meta.url), 'utf8'),
  ])
  assert.match(component, /Active portfolio/)
  assert.match(component, /aria-haspopup="listbox"/)
  assert.match(component, /Portfolio value/)
  assert.match(component, /\['30D'/)
  assert.match(component, /Record update/)
  assert.match(component, /portfolio-update-modal-layer/)
  assert.match(component, /role="dialog"/)
  assert.match(component, /aria-modal="true"/)
  assert.doesNotMatch(component, /\['watchlists', 'Watchlists'\]/)
  assert.doesNotMatch(component, /\['ideas', 'Ideas'\]/)
  assert.match(component, /item\.portfolioId === activePortfolio\.account\.id/)
  assert.match(component, /portfolio-alert-list/)
  assert.match(component, /Use natural language/)
  assert.match(component, /Confirm and record/)
  assert.match(component, /params\.set\('portfolio', portfolioId\)/)
  assert.match(component, /Correct ledger entry/)
  assert.match(component, /Confirm remove/)
  assert.match(route, /record-portfolio-update/)
  assert.match(route, /correct-portfolio-transaction/)
  assert.match(route, /void-portfolio-transaction/)
  assert.match(route, /parsePortfolioUpdate/)
  assert.match(repository, /recordPortfolioTransaction/)
  assert.match(repository, /Cannot sell/)
})

test('portfolio corrections preserve the original ledger event instead of overwriting it', async () => {
  const [migration, repository] = await Promise.all([
    readFile(new URL('../supabase/migrations/202608010001_portfolio_transaction_corrections.sql', import.meta.url), 'utf8'),
    readFile(new URL('../lib/server/portfolio.ts', import.meta.url), 'utf8'),
  ])
  assert.match(migration, /voided_at/i)
  assert.match(migration, /replaced_by_id/i)
  assert.match(repository, /correctPortfolioTransaction/)
  assert.match(repository, /voidPortfolioTransaction/)
  assert.match(repository, /Imported or brokerage entries cannot be changed here/)
})

test('portfolio alert migration excludes ideation and scopes retained alerts to a portfolio', async () => {
  const sql = await readFile(new URL('../supabase/migrations/202607310005_portfolio_alerts.sql', import.meta.url), 'utf8')
  assert.match(sql, /add column if not exists portfolio_id uuid/i)
  assert.match(sql, /decision_inbox_portfolio_open/i)
  assert.match(sql, /item_type not in \('new_candidate', 'thesis_refresh'\)/i)
  assert.match(sql, /delete from public\.decision_inbox_items/i)
})

test('portfolio monitoring derives alerts from open position lots, not watchlists or candidates', async () => {
  const monitoring = await readFile(new URL('../lib/server/research-monitoring.ts', import.meta.url), 'utf8')
  assert.match(monitoring, /portfolio_transactions/)
  assert.match(monitoring, /portfolio_id: item\.portfolioId/)
  assert.match(monitoring, /portfolio_id: trackedName\.portfolioId/)
  assert.doesNotMatch(monitoring, /market_watchlist_items/)
})

test('portfolio valuation loads every held symbol directly instead of a paginated screener slice', async () => {
  const [page, repository] = await Promise.all([
    readFile(new URL('../app/markets/portfolio/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../lib/server/markets-repository.ts', import.meta.url), 'utf8'),
  ])
  assert.match(page, /fetchLatestScreenerSymbols\(symbols\)/)
  assert.doesNotMatch(page, /fetchLatestScreener\(PORTFOLIO_UNIVERSE_QUERY\)/)
  assert.match(repository, /\.in\('symbol', requested\)/)
  assert.match(repository, /Portfolio valuation must never depend on whichever/)
})
