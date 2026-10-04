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
      assert.match(file, /^(manifest|critic-schema|name-\d+|(?:readable-)?evidence-\d+)\.json$/)
      assert.equal((await stat(join(directory, file))).mode & 0o777, 0o600)
    }
    return null
  })
  assert.equal(JSON.stringify(context), before)
  await assert.rejects(stat(directory), {code: 'ENOENT'})
})

test('bounded assessment keeps the full frozen portfolio and comparison evidence without changing its manifest hash',async()=>{
  const full=structuredClone(context)
  full.names.push({...structuredClone(context.names[0]),symbol:'OTHER',portfolioId:'other-account'})
  full.portfolio=[{account:'portfolio',cash:100},{account:'other-account',cash:500}]
  await withDecisionInputs(full,async input=>{
    const index=JSON.parse(input.prompt.split('\n')[1])
    assert.equal(index.names.length,1)
    assert.deepEqual(index.otherNames.map((n: {symbol:string})=>n.symbol),['OTHER'])
    assert.deepEqual(index.portfolio,full.portfolio)
    assert.equal(input.manifestHash,createHash('sha256').update(JSON.stringify(full)).digest('hex'))
    assert.deepEqual(JSON.parse(await readFile(join(input.directory,'manifest.json'),'utf8')),full)
    assert.deepEqual(JSON.parse(await readFile(join(input.directory,index.otherNames[0].file),'utf8')),full.names[1])
    const schema=JSON.parse(await readFile(input.criticSchemaPath!,'utf8'))
    assert.equal(schema.properties.blocks.items.anyOf.length,1)
    assert.deepEqual(schema.properties.blocks.items.anyOf[0].properties.symbol.enum,['ABC'])
  },{names:[full.names[0]]})
})

test('large captured documents stay exact and private while quotations and facts remain directly readable',async()=>{
  const full=structuredClone(context)
  const text='Opening disclosure. '.repeat(10000)+'Decisive contrary passage at the end.'
  const document={id:'doc',url:'https://issuer.example/filing',text}
  full.evidence[0].value={packet:{financialStatements:{revenue:123},researchDocuments:[document],researchCoverage:{documents:[document],topics:[{quote:'Decisive contrary passage at the end.'}]}}}
  await withDecisionInputs(full,async input=>{
    const index=JSON.parse(input.prompt.split('\n')[1])
    const evidence=index.evidence[0]
    const readable=JSON.parse(await readFile(join(input.directory,evidence.readableFile),'utf8'))
    assert.deepEqual(JSON.parse(await readFile(join(input.directory,evidence.file),'utf8')),full.evidence[0].value)
    assert.equal(readable.packet.researchDocuments[0].text,null)
    assert.deepEqual(readable.packet.financialStatements,{revenue:123})
    assert.equal(readable.packet.researchCoverage.topics[0].quote,'Decisive contrary passage at the end.')
    const reference=readable.packet.researchDocuments[0].frozenTextFile
    assert.equal(reference.file,readable.packet.researchCoverage.documents[0].frozenTextFile.file)
    const captured=await readFile(join(input.directory,reference.file))
    assert.equal(captured.toString('utf8'),text)
    assert.equal(captured.length,reference.bytes)
    assert.equal(createHash('sha256').update(captured).digest('hex'),reference.sha256)
    assert.equal((await stat(join(input.directory,reference.file))).mode&0o777,0o600)
    assert.equal((await readdir(input.directory)).filter(f=>f.endsWith('.txt')).length,1)
    assert.ok((await stat(join(input.directory,evidence.readableFile))).size<3000)
  })
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

test('blinded primary-evidence projections do not require capital decision names',async()=>{
  const context={id:'blind',ownerId:'owner',date:'2026-10-01',cutoff:'2026-10-01',policy:'shadow-only',codeVersion:'fixture',portfolio:null,market:null,world:[],names:[],gaps:[],universe:[],evidence:[]} as DecisionContext
  await withDecisionInputs(context,async input=>{
    assert.equal(input.criticSchemaPath,null)
    const manifest=JSON.parse(await readFile(join(input.directory,'manifest.json'),'utf8'))
    assert.deepEqual(manifest.names,[])
    assert.deepEqual(manifest.world,[])
  },{includeCriticSchema:false})
})
