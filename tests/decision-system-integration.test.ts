import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { generateDailyRecommendations } from '../lib/server/recommendations.ts'
import { abstention, decisionResearchSourceId, RECOMMENDATION_POLICY, type DecisionContext, type DecisionName, type EvidenceRef, type Recommendation } from '../lib/markets/recommendations.ts'

const capturedAt = '2026-10-01T12:00:00Z'
const cutoff = '2026-10-01T16:00:00Z'

function frozenPortfolio() {
  const context: DecisionContext = { id: 'manifest', ownerId: 'owner', date: '2026-10-01', cutoff, policy: RECOMMENDATION_POLICY, contracts: { research: 1 }, codeVersion: 'verified-release', portfolio: [], names: [], evidence: [], world: [], market: null, gaps: [], universe: [] }
  const recommendations: Recommendation[] = []
  for (const [index, action] of ['hold', 'sell'].entries()) {
    const instrumentType = index === 0 ? 'equity' : 'etf'
    const symbol = index === 0 ? 'COMPANY' : 'FUND'
    const packetId = `packet-${index}`
    const reportId = `report-${index}`
    const gapId = 'packet:cash flow statements'
    const dimension = (value: string) => ({ value, reason: 'Captured operating evidence supports this conclusion despite incomplete expansion evidence.', sourceIds: ['operations'], changeConditions: ['Reassess after the next reported operating results.'] })
    const content = {
      researchContractVersion: 1, formalRating: 'NOT_RATED', sourceIds: ['operations'],
      advice: { version: 1, businessView: dimension('mixed'), evidenceSufficiency: dimension('insufficient'), newEntryStance: dimension('wait'), existingPositionStance: dimension(action === 'hold' ? 'retain' : 'exit') },
      evidenceAssessment: { version: 1, gaps: [{ id: gapId, description: 'Expansion cash-flow evidence has not been retrieved.', availability: 'retrieval_failed', affectedActions: ['buy', 'add'], resolution: 'Retrieve the missing cash-flow disclosure before adding capital.' }], actionSupport: [{ action, reason: 'Current operating disclosures independently support the ownership decision; the missing expansion disclosure constrains new capital.', sourceIds: ['operations'], gapIds: [gapId], reversalConditions: ['Reassess after materially different operating results.'] }] },
    }
    const research = { id: reportId, content }
    const source = { id: 'operations', asOf: capturedAt, url: 'https://issuer.example.com/results', label: 'Reported operations', source: 'issuer' }
    const packet = { id: packetId, packet: { sources: [source], filings: [], events: [], evidenceQuality: { missing: ['cash flow statements'] } } }
    const sourceId = decisionResearchSourceId(packetId, source.id)
    const evidence = (id: string, kind: string, value: unknown): EvidenceRef => ({ id, kind, value, asOf: capturedAt, availableAt: capturedAt, retrievedAt: capturedAt, hash: id, url: null, feed: null })
    const name: DecisionName = { symbol, securityId: `verified-${symbol}`, portfolioId: 'account', instrumentType, owned: true, quantity: 10, currentWeightPct: 5, portfolioValue: 10000, cash: 1000, quote: { price: 50, asOf: capturedAt, feed: 'sip' }, research, thesis: { status: 'accepted' }, sources: [`research:${reportId}`, `packet:${packetId}`, sourceId], gaps: [`Missing ${instrumentType === 'etf' ? 'fund' : 'company'} evidence: cash flow statements`], providerEvidenceGaps: [{ id: gapId, description: 'Expansion cash-flow evidence has not been retrieved.' }], causalLinks: [], selectionReason: 'Owned: required coverage' }
    context.names.push(name)
    context.evidence.push(evidence(`research:${reportId}`, 'research', research), evidence(`packet:${packetId}`, instrumentType === 'etf' ? 'etf_packet' : 'company_packet', packet), evidence(sourceId, instrumentType === 'etf' ? 'etf_source' : 'company_source', { source, underlyingSourceId: source.id, packetId }))
    recommendations.push({ ...abstention(name, context, 'Reported operating disclosures support the ownership conclusion.'), action: action as 'hold' | 'sell',
      thesis: action === 'hold' ? 'Current operating evidence supports maintaining the existing positive exposure.' : 'The documented operating case supports exiting the existing fund exposure.',
      counterThesis: 'Improved operating results could support a more constructive ownership conclusion.',
      mechanism: 'Reported operations provide the basis for the existing-position judgment; no World forecast was used.',
      expectations: 'Reassess the operating case after the next disclosure; expansion economics remain unresolved.',
      confidence: 65, sourceIds: [...name.sources], gateReasons: [], entry: { trigger: 'manual_condition', condition: 'Review the current operating disclosures and the supported ownership conclusion.', maxPrice: null, targetWeightPct: action === 'hold' ? 5 : 0 } })
  }
  return { context, recommendations }
}

test('supported company and fund ownership traverses generation, independent review and publication despite entry-only gaps', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'stratum-decision-integration-'))
  const fixturePath = join(directory, 'model-fixture.json'), callsPath = join(directory, 'model-calls.jsonl')
  const previousEnvironment = { PATH: process.env.PATH, SUPABASE_URL: process.env.SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY }
  process.env.PATH = `${directory}:${process.env.PATH}`
  process.env.SUPABASE_URL = 'https://decision-integration.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'fixture-key'
  t.after(async () => {
    for (const [key, value] of Object.entries(previousEnvironment)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    await rm(directory, { recursive: true, force: true })
  })
  await writeFile(join(directory, 'codex'), `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
const argument = name => args[args.indexOf(name) + 1];
const schema = JSON.parse(fs.readFileSync(argument('--output-schema'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(argument('--cd') + '/manifest.json', 'utf8'));
const fixture = JSON.parse(fs.readFileSync(${JSON.stringify(fixturePath)}, 'utf8'));
const stage = schema.properties.recommendations ? 'generator' : 'critic';
fs.appendFileSync(${JSON.stringify(callsPath)}, JSON.stringify({ stage, symbols: manifest.names.map(name => name.symbol) }) + '\\n');
process.stdin.resume();
process.stdin.on('end', () => fs.writeFileSync(argument('--output-last-message'), JSON.stringify(stage === 'generator' ? fixture.generated : { blocks: fixture.blocks })));
`, { mode: 0o700 })
  let { context, recommendations } = frozenPortfolio()
  const publications: Array<{ p_recommendations: Recommendation[]; p_metadata: Record<string, unknown> }> = []
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input)), endpoint = url.pathname.split('/').at(-1)
    if (endpoint === 'recommendation_input_manifests') return Response.json({ content: context })
    if (endpoint === 'recommendation_batches') return Response.json(null)
    if (endpoint === 'publish_recommendation_batch') {
      assert.equal(init?.method, 'POST')
      publications.push(JSON.parse(String(init?.body)))
      return Response.json('published-batch')
    }
    throw new Error(`Unexpected decision dependency: ${endpoint}`)
  })
  const writeFixture = async (blocks: Array<{ portfolioId: string; symbol: string; reason: string }> = []) => {
    await writeFile(fixturePath, JSON.stringify({ generated: { summary: 'Each holding has an independently supported ownership stance.', recommendations }, blocks }))
    await writeFile(callsPath, '')
  }
  const calls = async () => (await readFile(callsPath, 'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line) as { stage: string; symbols: string[] })

  await t.test('entry-only gaps preserve independently supported Hold and Sell after both model stages', async () => {
    assert.ok(context.names.every(name => name.gaps.length > 0))
    await writeFixture()
    const result = await generateDailyRecommendations('owner', new Date(cutoff), 'integrated-review')
    assert.equal(result.batchId, 'published-batch')
    assert.deepEqual((await calls()).map(call => call.stage), ['generator', 'critic'])
    assert.ok((await calls()).every(call => call.symbols.length === 2))
    assert.deepEqual(publications.at(-1)!.p_recommendations.map(rec => rec.action), ['hold', 'sell'])
    assert.ok(publications.at(-1)!.p_recommendations.every(rec => rec.gateReasons.length === 0))
  })

  await t.test('independent review can veto one holding without suppressing another supported exit', async () => {
    await writeFixture([{ portfolioId: 'account', symbol: 'COMPANY', reason: 'The retain case omits a contrary operating disclosure.' }])
    await generateDailyRecommendations('owner', new Date(cutoff), 'independent-veto')
    assert.deepEqual((await calls()).map(call => call.stage), ['generator', 'critic'])
    const published = publications.at(-1)!.p_recommendations
    assert.deepEqual(published.map(rec => rec.action), ['no_trade', 'sell'])
    assert.match(published[0].gateReasons.join(' '), /contrary operating disclosure/)
    assert.equal(published[1].gateReasons.length, 0)
  })

  await t.test('universal identity failures abstain before spending model capacity', async () => {
    ;({ context, recommendations } = frozenPortfolio())
    for (const name of context.names) name.gaps.push('Stable security identity is unavailable')
    await writeFixture()
    await generateDailyRecommendations('owner', new Date(cutoff), 'identity-failure')
    assert.deepEqual(await calls(), [])
    const published = publications.at(-1)!.p_recommendations
    assert.deepEqual(published.map(rec => rec.action), ['no_trade', 'no_trade'])
    assert.ok(published.every(rec => rec.gateReasons.some(reason => reason.includes('Stable security identity'))))
  })
})
