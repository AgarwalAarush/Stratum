import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { archiveDecisionEvidence, restoreDecisionEvidence } from '../lib/server/decision-evidence-archive.ts'
import { withDecisionInputs } from '../lib/server/decision-inputs.ts'
import type { DecisionContext } from '../lib/markets/recommendations.ts'

const text = 'Captured company disclosure with Unicode Δ and operating evidence.\n'.repeat(2000) + 'A decisive production qualification passage beyond the introduction.'
const packet = { id:'immutable-packet',packet:{evidenceQuality:{missing:['cash flow']},researchDocuments:[{sourceId:'sec',text,capturedAt:'2026-10-03'}],researchCoverage:{documents:[{sourceId:'sec',text}],topics:[{id:'adoption',quotes:[{sourceId:'sec',quote:'A decisive production qualification passage beyond the introduction.'}]}]}} }

test('captured text archives are lossless and leave facts, quotes, timestamps and original packets intact', () => {
  const archived = archiveDecisionEvidence(packet) as typeof packet
  assert.ok(JSON.stringify(archived).length < JSON.stringify(packet).length / 4)
  assert.deepEqual(archived.packet.evidenceQuality,packet.packet.evidenceQuality)
  assert.deepEqual(archived.packet.researchCoverage.topics,packet.packet.researchCoverage.topics)
  assert.equal(archived.packet.researchDocuments[0].capturedAt,'2026-10-03')
  assert.equal(packet.packet.researchDocuments[0].text,text)
  assert.deepEqual(restoreDecisionEvidence(archived),packet)
  assert.deepEqual(archiveDecisionEvidence(archived),archived)
  assert.deepEqual(restoreDecisionEvidence({legacy:true}),{legacy:true})
  const corrupted = structuredClone(archived) as unknown as {packet:{researchDocuments:Array<{frozenTextArchive:{sha256:string;bytes:number}}>}}
  corrupted.packet.researchDocuments[0].frozenTextArchive.sha256 = 'invalid'
  assert.throws(()=>restoreDecisionEvidence(corrupted),/integrity/)
  corrupted.packet.researchDocuments[0].frozenTextArchive.bytes = 100_000_000
  assert.throws(()=>restoreDecisionEvidence(corrupted),/Invalid frozen/)
})

test('independent review receives the exact complete captured passages from the immutable archive', async () => {
  const context={id:'manifest',names:[{symbol:'XYZ',portfolioId:'account'}],evidence:[{id:'packet',value:archiveDecisionEvidence(packet)}],universe:[],portfolio:[],gaps:[]} as unknown as DecisionContext
  const stored = structuredClone(context.evidence[0].value)
  await withDecisionInputs(context,async input=>{
    const evidence = JSON.parse(await readFile(join(input.directory,'evidence-0.json'),'utf8'))
    assert.deepEqual(evidence,packet)
    const manifest = await readFile(join(input.directory,'manifest.json'),'utf8')
    assert.deepEqual(JSON.parse(manifest).evidence[0].value,packet)
    assert.equal(input.manifestHash,createHash('sha256').update(manifest).digest('hex'))
    assert.deepEqual(context.evidence[0].value,stored)
  })
})

test('repeated captured documents share one checked payload and legacy embedded archives remain readable',()=>{
  const repeated={...packet,packet:{...packet.packet,researchCoverage:{...packet.packet.researchCoverage,documents:[{sourceId:'coverage-alias',text},{sourceId:'sec',text}]}}}
  const archived=archiveDecisionEvidence(repeated) as {frozenDocumentTexts:{texts:Record<string,{data:string}>}}
  assert.equal(Object.keys(archived.frozenDocumentTexts.texts).length,1)
  assert.deepEqual(restoreDecisionEvidence(archived),repeated)
  const broken=structuredClone(archived);broken.frozenDocumentTexts.texts={}
  assert.throws(()=>restoreDecisionEvidence(broken),/integrity/)
  const bytes=Buffer.from(text),legacy={...packet,packet:{...packet.packet,researchDocuments:[{sourceId:'sec',capturedAt:'2026-10-03',text:null,frozenTextArchive:{encoding:'gzip-base64-v1',data:gzipSync(bytes).toString('base64'),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}}]}}
  assert.deepEqual(restoreDecisionEvidence(legacy),packet)
})
