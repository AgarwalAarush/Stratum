import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, stat, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { withDecisionInputs } from '../lib/server/decision-inputs.ts'
import type { DecisionContext } from '../lib/markets/recommendations.ts'

const context: DecisionContext = {
  id: 'manifest', ownerId: 'owner', date: '2026-09-07', cutoff: '2026-09-07T13:00:00Z',
  policy: 'prospective-v1.2', codeVersion: 'release', portfolio: [], gaps: [],
  market: { dataAsOf: '2026-09-04' }, world: { contrary: 'mechanism may fail' },
  universe: [{symbol: 'XYZ', selected: false, reason: 'Rejected candidate retained'}],
  names: [{ symbol: 'ABC', securityId: 'stable-id', portfolioId: 'portfolio', owned: true,
    quantity: 2, currentWeightPct: 4, portfolioValue: 10000, cash: 100,
    quote: {price: 200, asOf: '2026-09-04', feed: 'iex'},
    research: {id: 'report', status: 'complete', content: {
      investmentThesis: 'A test thesis', fastestKillSignal: 'Margins reverse',
      sections: [{title: 'Counter evidence', body: 'Contrary evidence. '.repeat(80000)}],
    }}, thesis: null, sources: ['../untrusted-source'], gaps: [], causalLinks: [], selectionReason: 'owned' }],
  evidence: [{id: '../untrusted-source', kind: 'company_packet', url: 'https://issuer.example',
    asOf: '2026-09-04', availableAt: '2026-09-05', retrievedAt: '2026-09-07', hash: 'original-hash',
    feed: null, value: {rawTranscript: 'Frozen contrary facts. '.repeat(80000)} }],
}

test('bounded prompt preserves the complete frozen manifest, source values and names in private files', async () => {
  let directory = ''
  const before = JSON.stringify(context)
  await withDecisionInputs(context, async input => {
    directory = input.directory
    assert.ok(input.indexBytes < 10000)
    assert.equal((await stat(directory)).mode & 0o777, 0o700)
    assert.equal(await readFile(join(directory, 'manifest.json'), 'utf8'), before)
    assert.equal(input.manifestHash, createHash('sha256').update(before).digest('hex'))
    const index = JSON.parse(input.prompt.split('\n')[1])
    assert.deepEqual(JSON.parse(await readFile(join(directory, index.names[0].file), 'utf8')), context.names[0])
    assert.deepEqual(JSON.parse(await readFile(join(directory, index.evidence[0].file), 'utf8')), context.evidence[0].value)
    assert.equal(index.evidence[0].availableAt, '2026-09-05')
    assert.equal(index.evidence[0].hash, 'original-hash')
    assert.equal(index.evidence[0].id, '../untrusted-source')
    assert.equal(index.names[0].research.file, index.names[0].file)
    assert.equal(index.names[0].research.field, 'research')
    for (const file of await readdir(directory)) {
      assert.match(file, /^(manifest|name-\d+|evidence-\d+)\.json$/)
      assert.equal((await stat(join(directory, file))).mode & 0o777, 0o600)
    }
    return null
  })
  assert.equal(JSON.stringify(context), before)
  await assert.rejects(stat(directory), {code: 'ENOENT'})
})

test('large ETF narrative fields and accepted theses stay readable without inflating the index', async () => {
  const large = structuredClone(context)
  large.names = Array.from({length: 50}, (_, i) => ({
    ...structuredClone(context.names[0]), symbol: `ETF${i}`, instrumentType: 'etf',
    thesis: {affirmativeBelief: 'Accepted thesis evidence. '.repeat(10000)},
    research: {id: `report-${i}`, status: 'complete', content: {
      investmentThesis: 'Long affirmative evidence. '.repeat(10000),
      counterThesis: 'Long contrary evidence. '.repeat(10000),
    }},
  }))
  await withDecisionInputs(large, async input => {
    assert.ok(input.indexBytes < 100000)
    const index = JSON.parse(input.prompt.split('\n')[1])
    assert.equal(index.names.length, 50)
    for (const [i, name] of index.names.entries()) {
      const frozen = JSON.parse(await readFile(join(input.directory, name.file), 'utf8'))
      assert.deepEqual(frozen.research, large.names[i].research)
      assert.deepEqual(frozen.thesis, large.names[i].thesis)
      assert.equal(name.thesis.field, 'thesis')
    }
  })
})

test('failed generator/critic also removes the temporary private evidence', async () => {
  let directory = ''
  await assert.rejects(withDecisionInputs(context, async input => {
    directory = input.directory
    throw new Error('critic failed')
  }), /critic failed/)
  await assert.rejects(stat(directory), {code: 'ENOENT'})
})
