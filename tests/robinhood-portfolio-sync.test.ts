import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  getRobinhoodPortfolioSyncConfig,
  normalizeRobinhoodPortfolioSnapshot,
} from '../lib/server/robinhood-portfolio-sync.ts'
import { normalizeBrokerageSnapshot } from '../lib/server/portfolio.ts'
import { buildDueAgentJobs } from '../lib/server/agent-schedule.ts'

test('Robinhood normalization uses the newest available price and preserves private account values', () => {
  const snapshot = normalizeRobinhoodPortfolioSnapshot(
    { structuredContent: { data: { positions: [
      { symbol: 'NVDA', quantity: '2.5', average_buy_price: '180.00' },
      { symbol: 'BAD', quantity: '0', average_buy_price: '1.00' },
    ] } } },
    { structuredContent: { data: {
      cash: '250.25', equity_value: '600.50', total_value: '850.75',
      buying_power: { buying_power: '250.25' }, currency: 'USD',
    } } },
    { structuredContent: { data: { results: [{ quote: {
      symbol: 'NVDA', has_traded: true,
      last_trade_price: '200.00', venue_last_trade_time: '2026-08-01T19:59:59.000Z',
      last_non_reg_trade_price: '201.25', venue_last_non_reg_trade_time: '2026-08-01T20:15:00.000Z',
    } }] } } },
    '2026-08-01T20:16:00.000Z',
  )
  assert.deepEqual(snapshot, {
    capturedAt: '2026-08-01T20:16:00.000Z',
    cashBalance: 250.25,
    equityValue: 600.5,
    totalValue: 850.75,
    buyingPower: 250.25,
    currency: 'USD',
    positions: [{
      symbol: 'NVDA', quantity: 2.5, costBasisPerShare: 180,
      currentPrice: 201.25, quoteAsOf: '2026-08-01T20:15:00.000Z',
    }],
  })
})

test('Robinhood worker configuration remains server-only and opt-in', () => {
  assert.equal(getRobinhoodPortfolioSyncConfig({ ROBINHOOD_SYNC_ENABLED: 'false' }), null)
  assert.deepEqual(getRobinhoodPortfolioSyncConfig({
    ROBINHOOD_SYNC_ENABLED: 'true',
    ROBINHOOD_PORTFOLIO_OWNER_ID: 'owner-1',
    ROBINHOOD_ACCOUNT_NUMBER: '123456789',
    ROBINHOOD_MCP_OAUTH_STORE: '/var/private/stratum/robinhood-oauth.json',
  }), {
    ownerId: 'owner-1',
    portfolioName: 'Personal',
    accountNumber: '123456789',
    oauthStorePath: '/var/private/stratum/robinhood-oauth.json',
    oauthRedirectUrl: 'http://127.0.0.1:1456/callback',
    mcpUrl: 'https://agent.robinhood.com/mcp/trading',
  })
})

test('Portfolio hydration accepts the singular account snapshot shape returned by PostgREST', () => {
  const snapshot = normalizeBrokerageSnapshot({
    captured_at: '2026-08-01T22:00:24.235Z',
    brokerage_account_snapshots: { cash_balance: 200, equity_value: 800, total_value: 1000 },
    brokerage_position_snapshots: [{
      symbol: 'NVDA', quantity: 2, cost_basis_per_share: 300,
      current_price: 400, quote_as_of: '2026-08-01T22:00:00.000Z',
    }],
  })
  assert.deepEqual(snapshot, {
    capturedAt: '2026-08-01T22:00:24.235Z',
    cashBalance: 200,
    equityValue: 800,
    totalValue: 1000,
    positions: [{
      symbol: 'NVDA', quantity: 2, costBasisPerShare: 300,
      currentPrice: 400, quoteAsOf: '2026-08-01T22:00:00.000Z',
    }],
  })
})

test('the macserver schedule captures the private account at open, midday, close, and final settlement windows', () => {
  const options = { includeRobinhood: true }
  const at = (value: string) => buildDueAgentJobs(new Date(value), options)
    .find((job) => job.jobType === 'sync-robinhood-portfolio')?.payload
  assert.deepEqual(at('2026-08-03T13:20:00Z'), { slot: 'open', tradingDate: '2026-08-03' })
  assert.deepEqual(at('2026-08-03T16:15:00Z'), { slot: 'midday', tradingDate: '2026-08-03' })
  assert.deepEqual(at('2026-08-03T20:15:00Z'), { slot: 'close', tradingDate: '2026-08-03' })
  assert.deepEqual(at('2026-08-04T00:00:00Z'), { slot: 'final', tradingDate: '2026-08-03' })
  assert.equal(at('2026-08-01T16:15:00Z'), undefined)
})

test('brokerage snapshots are durable, private, and distinct from the transaction ledger', async () => {
  const sql = await readFile(new URL('../supabase/migrations/202608010001_private_brokerage_sync.sql', import.meta.url), 'utf8')
  assert.match(sql, /create table if not exists public\.brokerage_sync_runs/i)
  assert.match(sql, /create table if not exists public\.brokerage_account_snapshots/i)
  assert.match(sql, /create table if not exists public\.brokerage_position_snapshots/i)
  assert.match(sql, /account_last4 text not null/i)
  assert.doesNotMatch(sql, /account_number text/i)
  assert.match(sql, /enable row level security/i)
})
