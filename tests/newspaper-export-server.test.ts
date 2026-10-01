import test from 'node:test'
import assert from 'node:assert/strict'
import { MARKETS_OWNER_ID } from '../lib/auth/markets-auth.ts'
import { serveNewspaperExport } from '../lib/server/newspaper-export.ts'

test('default export readers use persisted owner capture, ignore phantom ledger, and never touch jobs/outbox or providers', async context => {
  process.env.SUPABASE_URL = 'https://newspaper-authority-test.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'fixture-only-key'
  const accountId = '00000000-0000-4000-8000-000000000002'
  const capturedAt = '2026-10-01T12:15:00Z', quoteAsOf = '2026-10-01T12:14:00Z'
  const requests: URL[] = []
  let captureUnavailable = false, noEdition = false
  context.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    assert.equal(init?.method, 'GET')
    const url = new URL(String(input)); requests.push(url)
    assert.equal(url.hostname, 'newspaper-authority-test.supabase.co')
    assert.equal(url.searchParams.get('owner_id'), `eq.${MARKETS_OWNER_ID}`)
    const table = url.pathname.split('/').at(-1)!
    if (captureUnavailable && table === 'brokerage_sync_runs') return Response.json({ message: 'private-error' }, { status: 500 })
    const fixtures: Record<string, unknown> = {
      portfolios: [{ id: accountId, name: 'Personal', kind: 'brokerage', initial_funds: 0, created_at: '2026-01-01' }],
      portfolio_transactions: [{ id: 'phantom', portfolio_id: accountId, action: 'buy', symbol: 'PHANTOM', quantity: 99, price_per_share: 1, occurred_at: '2026-01-01', created_at: '2026-01-01', voided_at: null }],
      portfolio_confirmations: [],
      brokerage_sync_runs: [{ id: 'capture', portfolio_id: accountId, captured_at: capturedAt,
        brokerage_account_snapshots: [{ cash_balance: 300, equity_value: 700, total_value: 1000 }],
        brokerage_position_snapshots: [{ symbol: 'EXAMPLE', quantity: 7, cost_basis_per_share: 90, current_price: 100, quote_as_of: quoteAsOf }] }],
      recommendation_batches: noEdition ? null : { id: 'edition', manifest_id: 'manifest', published_at: capturedAt, decision_date: '2026-10-01', summary: 'Fictional test edition' },
      recommendation_versions: [{ id: 'recommendation', content: { symbol: 'EXAMPLE', portfolioId: accountId, action: 'hold', reason: 'Published fixture analysis', expiresAt: '2026-10-02T12:00:00Z', sourceIds: ['source'] } }],
      recommendation_input_manifests: { cutoff: capturedAt, policy: 'fixture', gaps: [], evidence: [{ id: 'source', url: 'https://www.sec.gov/Archives/fixture', asOf: capturedAt, availableAt: capturedAt, retrievedAt: capturedAt, feed: 'SEC' }] },
    }
    assert.ok(table in fixtures, `Unexpected read of ${table}`)
    return Response.json(fixtures[table])
  })
  const read = () => serveNewspaperExport(new Request('https://stratum.example/api/markets/newspaper'), {
    authenticate: async () => ({ id: MARKETS_OWNER_ID }), now: () => new Date('2026-10-01T13:00:00Z'),
  })
  const response = await read()
  assert.equal(response.status, 200)
  const data = await response.json()
  assert.equal(data.portfolios[0].totalValue, 1000)
  assert.equal(data.portfolios[0].holdings[0].unrealizedPnl, 70)
  assert.equal(data.portfolios[0].holdings[0].quoteAsOf, quoteAsOf)
  assert.equal(data.analysis.status, 'published')
  assert.ok(!JSON.stringify(data).includes('PHANTOM'))
  assert.ok(!requests.some(url => /outbox|agent_jobs|market_snapshots|screener_rows/.test(url.pathname)))
  const capture = requests.find(url => url.pathname.endsWith('/brokerage_sync_runs'))!
  assert.equal(capture.searchParams.get('portfolio_id'), `eq.${accountId}`)
  assert.equal(capture.searchParams.get('status'), 'eq.succeeded')
  noEdition = true
  const unpublished = await (await read()).json()
  assert.equal(unpublished.analysis.status, 'unavailable')
  assert.ok(unpublished.analysis.readiness.flags.includes('no_published_edition'))
  captureUnavailable = true
  const failed = await read()
  assert.equal(failed.status, 503)
  assert.doesNotMatch(await failed.text(), /private-error|Personal|EXAMPLE/)
})
