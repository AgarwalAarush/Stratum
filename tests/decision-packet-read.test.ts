import test from 'node:test'
import assert from 'node:assert/strict'
import { assembleDecisionContext, contentHash, loadDecisionPackets } from '../lib/server/recommendations.ts'
import { restoreDecisionEvidence } from '../lib/server/decision-evidence-archive.ts'

process.env.SUPABASE_URL = 'http://127.0.0.1:54321'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fixture'
const owner = '00000000-0000-4000-8000-000000000001'
const cutoff = '2026-10-03T20:00:00Z'
const capturedText = `${'Original captured disclosure with Unicode ₹. '.repeat(1200)}\nA decisive late passage must remain available.`

test('decision packet reads bind each exact version, owner and cutoff sequentially without truncating captured evidence', async t => {
  const seen: string[] = []
  let active = 0, maxActive = 0
  t.mock.method(globalThis, 'fetch', async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = new URL(String(input))
    assert.equal(url.searchParams.get('owner_id'), `eq.${owner}`)
    assert.equal(url.searchParams.get('generated_at'), `lte.${cutoff}`)
    assert.equal(url.searchParams.get('select'), '*')
    assert.ok(init?.signal)
    const id = url.searchParams.get('id')!.slice(3)
    assert.ok(url.searchParams.get('id')!.startsWith('eq.'))
    seen.push(id)
    maxActive = Math.max(maxActive, ++active)
    await Promise.resolve()
    active--
    return Response.json([{ id, packet: { researchDocuments: [{ text: capturedText }] } }])
  })
  const ids = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p1']
  const rows = await loadDecisionPackets('company_packets', owner, cutoff, ids)
  assert.deepEqual(seen, ids.slice(0, 6))
  assert.deepEqual(rows.map(row => row.id), ids.slice(0, 6))
  assert.equal(maxActive, 1)
  for (const row of rows) assert.deepEqual(row.packet, { researchDocuments: [{ text: capturedText }] })
  assert.deepEqual(await loadDecisionPackets('company_packets', owner, cutoff, []), [])
  assert.equal(seen.length, 6)
})

test('a later failed exact packet read rejects the entire required set without retrying or reporting partial success', async t => {
  const seen: string[] = []
  t.mock.method(globalThis, 'fetch', async (input: Parameters<typeof fetch>[0]) => {
    const id = new URL(String(input)).searchParams.get('id')!.slice(3)
    seen.push(id)
    return id === 'p2'
      ? Response.json({ message: 'Temporary unavailable' }, { status: 503 })
      : Response.json([{ id, packet: { researchDocuments: [{ text: capturedText }] } }])
  })
  await assert.rejects(loadDecisionPackets('company_packets', owner, cutoff, ['p1', 'p2', 'p3']), /required immutable packet p2 could not be read/)
  assert.deepEqual(seen, ['p1', 'p2'])
})

test('an unavailable or mismatched ETF packet cannot masquerade as a complete required read', async t => {
  let rows: unknown[] = []
  t.mock.method(globalThis, 'fetch', async (input: Parameters<typeof fetch>[0]) => {
    assert.ok(new URL(String(input)).pathname.endsWith('/etf_research_packets'))
    return Response.json(rows)
  })
  await assert.rejects(loadDecisionPackets('etf_research_packets', owner, cutoff, ['p1']), /unavailable for this owner at the decision cutoff/)
  rows = [{ id: 'another-packet' }]
  await assert.rejects(loadDecisionPackets('etf_research_packets', owner, cutoff, ['p1']), /unavailable for this owner at the decision cutoff/)
})

function decisionFixture() {
  const packet = { id: 'p1', packet: { researchDocuments: [{ sourceId: 'document', text: capturedText }], evidenceQuality: { checkedAt: cutoff } }, data_as_of: cutoff, generated_at: cutoff }
  const rows: Record<string, unknown[]> = {
    portfolios: [{ id: 'portfolio', name: 'Fixture', kind: 'manual', initial_funds: 1000, started_at: cutoff, created_at: cutoff }],
    portfolio_transactions: [], portfolio_confirmations: [], investment_theses: [], causal_model_versions: [],
    market_snapshots: [], candidate_briefs: [], investment_macro_vintages: [], etf_research_notes: [],
    market_interest_memberships: [], agent_jobs: [], research_refresh_checks: [], market_bars_daily: [],
    market_watchlists: [{ id: 'watchlist', market_watchlist_items: [{ symbol: 'ABC' }] }],
    equity_research_notes: [{ id: 'note', symbol: 'ABC', status: 'complete', company_packet_id: 'p1', generated_at: cutoff, data_as_of: cutoff, content: {} }],
    market_assets: [{ symbol: 'ABC', alpaca_id: 'asset', name: 'Fixture Company' }], company_packets: [packet],
  }
  return { rows, packet }
}

test('failed required source retrieval stops production assembly before any freeze RPC', async t => {
  const { rows } = decisionFixture()
  rows.market_watchlists = [{ id: 'watchlist', market_watchlist_items: [{ symbol: 'ABC' }, { symbol: 'DEF' }] }]
  rows.equity_research_notes.push({ id: 'later-note', symbol: 'DEF', status: 'complete', company_packet_id: 'p2', generated_at: cutoff, data_as_of: cutoff, content: {} })
  const requests: string[] = []
  const packetIds: string[] = []
  t.mock.method(globalThis, 'fetch', async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = new URL(String(input)), table = url.pathname.split('/').at(-1)!
    requests.push(table)
    assert.equal(init?.method, 'GET', 'Missing source evidence must never reach a write')
    if (table === 'recommendation_input_manifests') return Response.json(null)
    if (table === 'company_packets') {
      const id = url.searchParams.get('id')!.slice(3)
      packetIds.push(id)
      if (id === 'p2') throw new DOMException('Read timed out', 'TimeoutError')
    }
    assert.ok(table in rows, `Unexpected fixture read: ${table}`)
    return Response.json(rows[table])
  })
  await assert.rejects(assembleDecisionContext(owner, new Date(cutoff), 'required-source-fixture'), /required immutable packet p2 could not be read/)
  assert.deepEqual(packetIds, ['p1', 'p2'])
  assert.ok(!requests.includes('freeze_recommendation_input'))
})

test('a read-only diagnostic may explicitly report an unavailable packet without freezing incomplete evidence', async t => {
  const { rows } = decisionFixture()
  t.mock.method(globalThis, 'fetch', async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const table = new URL(String(input)).pathname.split('/').at(-1)!
    assert.equal(init?.method, 'GET')
    if (table === 'recommendation_input_manifests') return Response.json(null)
    if (table === 'company_packets') return Response.json([])
    assert.ok(table in rows, `Unexpected fixture read: ${table}`)
    return Response.json(rows[table])
  })
  const context = await assembleDecisionContext(owner, new Date(cutoff), 'diagnostic-fixture', { persist: false })
  assert.ok(context.gaps.some(gap => gap.startsWith('Company packets unavailable: company_packets: required immutable packet p1')))
  assert.ok(!context.evidence.some(item => item.kind === 'company_packet'))
})

test('complete source packets reach the immutable freeze with lossless captured text', async t => {
  const { rows, packet } = decisionFixture()
  let frozen: Record<string, unknown> | undefined
  t.mock.method(globalThis, 'fetch', async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = new URL(String(input)), table = url.pathname.split('/').at(-1)!
    if (table === 'freeze_recommendation_input') {
      assert.equal(init?.method, 'POST')
      const manifest = JSON.parse(String(init?.body)).p_manifest
      frozen = manifest.content
      assert.equal(manifest.content_hash, contentHash(frozen))
      return Response.json(manifest.id)
    }
    assert.equal(init?.method, 'GET')
    if (table === 'recommendation_input_manifests') return Response.json(null)
    assert.ok(table in rows, `Unexpected fixture read: ${table}`)
    return Response.json(rows[table])
  })
  const context = await assembleDecisionContext(owner, new Date(cutoff), 'complete-source-fixture')
  assert.ok(frozen)
  const source = context.evidence.find(item => item.kind === 'company_packet')
  assert.ok(source)
  const restored = restoreDecisionEvidence(source.value) as typeof packet
  assert.equal(restored.packet.researchDocuments[0].text, capturedText)
  assert.equal(restored.id, packet.id)
  assert.ok(!context.gaps.some(gap => gap.startsWith('Company packets')))
})
