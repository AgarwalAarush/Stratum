import assert from 'node:assert/strict'
import test from 'node:test'
import { canonicalCausalVersions, canonicalResearchNote, primaryResearchPacket, needsIndependentResearch, PRIMARY_RESEARCH_AUTHORITY, currentWorldVersions } from '../lib/markets/evidence-authority.ts'

test('shadow, legacy and historic versions cannot leak into promoted decision authority', () => {
  const base = { causal_key: 'world:power', state: 'active', source_kind: 'world_node', as_of: '2026-09-01', freshness: { canonical: true, nextReviewAt: '2026-10-04' } }
  const rows = [{ ...base, id: 'old', created_at: '2026-09-01' }, { ...base, id: 'current', created_at: '2026-09-30' },
    { ...base, id: 'shadow', state: 'shadow', created_at: '2026-10-01' }, { ...base, id: 'legacy', source_kind: 'market_thesis', created_at: '2026-10-02' }]
  assert.deepEqual(canonicalCausalVersions(rows, false, '2026-10-03'), [])
  assert.deepEqual(canonicalCausalVersions(rows, true, '2026-10-03'), [])
  assert.deepEqual(canonicalCausalVersions(rows.slice(0,2), true, '2026-10-03').map(row => row.id), ['current'])
})

test('World conclusions are stripped across packet handoffs while evidence and questions remain', () => {
  const packet = {company:{name:'Example'},sources:[{id:'filing',url:'https://sec.gov/filing'}],marketTheses:[{economics:'shadow rent claim'}],worldOrigin:{id:'lead',decisive_questions:['Can capacity support demand?'],transmission_mechanism:'shadow transmission claim',capture_conditions:['shadow profit claim'],documentUrls:['https://sec.gov/lead','javascript:alert(1)']}}
  const frozen = structuredClone(packet)
  const clean = primaryResearchPacket(packet)
  assert.deepEqual(packet, frozen)
  assert.deepEqual(clean.sources, packet.sources)
  assert.deepEqual(clean.marketTheses, [])
  assert.equal(JSON.stringify(clean).includes('shadow rent claim'), false)
  assert.equal(JSON.stringify(clean).includes('shadow transmission claim'), false)
  assert.equal(JSON.stringify(clean).includes('shadow profit claim'), false)
  assert.deepEqual((clean.worldOrigin as unknown as Record<string,unknown>).decisive_questions,['Can capacity support demand?'])
  assert.deepEqual((clean.worldOrigin as unknown as Record<string,unknown>).documentUrls,['https://sec.gov/lead'])
})

test('affected legacy reports require independent reconstruction without suppressing unrelated legacy reports', () => {
  const legacy = {id:'old',content:{investmentThesis:'Legacy profit narrative',worldContextOrigin:{capture_mechanism:'shadow capture'}}}
  assert.equal(canonicalResearchNote(legacy, {}), null)
  assert.equal(needsIndependentResearch({id:'old',content:{}}, {marketTheses:[{id:'belief'}]}), true)
  assert.equal(needsIndependentResearch({id:'old',content:{}}, {marketTheses:[]}), false)
  const independent = {...legacy,content:{...legacy.content,evidenceAuthority:PRIMARY_RESEARCH_AUTHORITY}}
  assert.equal(needsIndependentResearch(independent, {marketTheses:[{id:'belief'}]}),false)
  const canonical = canonicalResearchNote(independent,{})!
  assert.equal('worldContextOrigin' in canonical.content,false)
  assert.equal(canonical.content.investmentThesis,'Legacy profit narrative')
  assert.equal('worldContextOrigin' in independent.content,true)
})

test('latest invalidation suppresses stale authority while shadow trials can freeze pre-cutoff beliefs', () => {
  const base={causal_key:'world:power',source_kind:'world_node',as_of:'2026-09-01',freshness:{canonical:true,nextReviewAt:'2026-10-04'}}
  const rows=[{...base,id:'active',state:'active',created_at:'2026-09-01'},{...base,id:'invalidated',state:'invalidated',created_at:'2026-09-20'},{...base,id:'future',state:'shadow',created_at:'2026-10-02'},{...base,id:'unknown',state:'shadow',created_at:null}]
  assert.deepEqual(canonicalCausalVersions(rows.slice(0,2),true,'2026-10-01'),[])
  assert.deepEqual(currentWorldVersions(rows,'2026-09-15').map(r=>r.id),['active'])
  assert.deepEqual(currentWorldVersions(rows,'2026-10-01').map(r=>r.id),['invalidated'])
})

test('overdue latest World beliefs abstain without reviving an older fresh version', () => {
  const base = { causal_key: 'world:power', source_kind: 'world_node', state: 'active', as_of: '2026-10-01' }
  const old = { ...base, id: 'old', created_at: '2026-10-01', freshness: { canonical: true, nextReviewAt: '2026-10-05' } }
  const latest = { ...base, id: 'latest', created_at: '2026-10-02', freshness: { canonical: true, nextReviewAt: '2026-10-03T12:00:00Z' } }
  assert.deepEqual(canonicalCausalVersions([old, latest], true, '2026-10-03T11:59:59Z').map(row => row.id), ['latest'])
  assert.deepEqual(canonicalCausalVersions([old, latest], true, '2026-10-03T12:00:00Z'), [])
  assert.deepEqual(canonicalCausalVersions([old, latest], true, '2026-10-03T12:00:01Z'), [])
  assert.equal(currentWorldVersions([old, latest], '2026-10-03T12:00:01Z')[0].id, 'latest')
})

test('canonical World requires valid review and knowledge timestamps at the frozen cutoff', () => {
  const base = { causal_key: 'world:power', source_kind: 'world_node', state: 'active', id: 'current', as_of: '2026-10-01', created_at: '2026-10-02', freshness: { canonical: true, nextReviewAt: '2026-10-04' } }
  assert.deepEqual(canonicalCausalVersions([base], true, '2026-10-03').map(row => row.id), ['current'])
  for (const row of [
    { ...base, freshness: { canonical: true } },
    { ...base, freshness: { canonical: true, nextReviewAt: 'unknown' } },
    { ...base, as_of: '2026-10-04' },
    { ...base, created_at: '2026-10-04' },
    { ...base, as_of: null },
    { ...base, created_at: null },
  ]) assert.deepEqual(canonicalCausalVersions([row], true, '2026-10-03'), [])
  assert.deepEqual(canonicalCausalVersions([base], true, 'invalid'), [])
})

test('World authority selects current beliefs within the accepted projection commit', () => {
  const base = { causal_key: 'world:power', source_kind: 'world_node', state: 'active', as_of: '2026-10-01', freshness: { canonical: true, nextReviewAt: '2026-10-05' } }
  const prior = { ...base, id: 'prior', created_at: '2026-10-01', source_commit: 'B' }
  const current = { ...base, id: 'current', created_at: '2026-10-02', source_commit: 'C' }
  assert.deepEqual(canonicalCausalVersions([prior], true, '2026-10-03', 'C'), [])
  assert.deepEqual(canonicalCausalVersions([prior, current], true, '2026-10-03', 'C').map(row => row.id), ['current'])
  assert.deepEqual(canonicalCausalVersions([prior, current], true, '2026-10-03', 'B').map(row => row.id), ['prior'])
  assert.deepEqual(canonicalCausalVersions([prior, current], true, '2026-10-03', null), [])
  assert.deepEqual(canonicalCausalVersions([{ ...current, source_commit: null }], true, '2026-10-03', 'C'), [])
})

test('late materialization from a superseded commit cannot hide accepted beliefs or revive expired ones', () => {
  const base = { causal_key: 'world:power', source_kind: 'world_node', state: 'active', as_of: '2026-10-01', freshness: { canonical: true, nextReviewAt: '2026-10-05' } }
  const accepted = { ...base, id: 'accepted-C', created_at: '2026-10-02T10:00:00Z', source_commit: 'C' }
  const latePrior = { ...base, id: 'late-B', created_at: '2026-10-02T12:00:00Z', source_commit: 'B' }
  assert.deepEqual(canonicalCausalVersions([accepted, latePrior], true, '2026-10-03', 'C').map(row => row.id), ['accepted-C'])
  const expired = { ...accepted, id: 'expired-C', created_at: '2026-10-02T11:00:00Z', freshness: { canonical: true, nextReviewAt: '2026-10-03' } }
  assert.deepEqual(canonicalCausalVersions([accepted, expired, latePrior], true, '2026-10-03', 'C'), [])
})
