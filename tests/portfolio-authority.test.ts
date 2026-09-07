import test from 'node:test'
import assert from 'node:assert/strict'
import {
  fetchAuthoritativePortfolios,
  fetchPortfolioWorkspace,
} from '../lib/server/portfolio.ts'
const owner = '00000000-0000-4000-8000-000000000001',
  account = '00000000-0000-4000-8000-000000000002'
test('broker-only holdings and empty successful captures override corrected ledger history', async () => {
  process.env.SUPABASE_URL = 'http://127.0.0.1:54321'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'fixture-key'
  const original = globalThis.fetch
  let positions: unknown[] = [
    {
      symbol: 'BROKER',
      quantity: 7,
      cost_basis_per_share: 90,
      current_price: 100,
      quote_as_of: '2026-09-04T20:00:00Z',
    },
  ]
  let fail = false
  globalThis.fetch = async (input) => {
    const url = new URL(String(input)),
      table = url.pathname.split('/').at(-1)
    if (fail && table === 'brokerage_sync_runs')
      return new Response(
        JSON.stringify({ message: 'Unavailable capture store' }),
        { status: 503 },
      )
    const rows =
      table === 'portfolios'
        ? [
            {
              id: account,
              owner_id: owner,
              name: 'Personal',
              kind: 'brokerage',
              created_at: '2026-01-01',
            },
          ]
        : table === 'portfolio_transactions'
          ? [
              {
                id: 'tx',
                portfolio_id: account,
                symbol: 'PHANTOM',
                action: 'buy',
                quantity: 20,
                price_per_share: 10,
                fees: 0,
                occurred_at: '2026-01-02',
                created_at: '2026-01-02',
                voided_at: '2026-01-03',
              },
            ]
          : table === 'brokerage_sync_runs'
            ? [
                {
                  id: 'sync',
                  portfolio_id: account,
                  captured_at: '2026-09-04T20:00:00Z',
                  brokerage_account_snapshots: [
                    {
                      cash_balance: 300,
                      equity_value: positions.length ? 700 : 0,
                      total_value: positions.length ? 1000 : 300,
                    },
                  ],
                  brokerage_position_snapshots: positions,
                },
              ]
            : []
    return new Response(JSON.stringify(rows), {
      headers: { 'Content-Type': 'application/json' },
    })
  }
  try {
    const result = await fetchAuthoritativePortfolios(owner)
    assert.deepEqual(
      result[0].holdings.map((h) => h.symbol),
      ['BROKER'],
    )
    assert.equal(result[0].dataSource, 'robinhood')
    assert.equal(result[0].totalValue, 1000)
    positions = []
    assert.deepEqual(
      (await fetchAuthoritativePortfolios(owner))[0].holdings,
      [],
    )
    const workspace = await fetchPortfolioWorkspace(owner)
    assert.deepEqual(workspace.portfolios[0].holdings, [])
    fail = true
    await assert.rejects(
      () => fetchAuthoritativePortfolios(owner),
      /Unavailable capture store/,
    )
  } finally {
    globalThis.fetch = original
  }
})
