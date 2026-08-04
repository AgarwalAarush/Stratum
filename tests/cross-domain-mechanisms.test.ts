import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { getMarketDomainPack } from '../lib/markets/domain-packs.ts'

test('domain packs declare explicit directional cross-domain mechanisms', () => {
  const power = getMarketDomainPack('ai-power')
  const semicap = getMarketDomainPack('semicap-data-center-equipment')
  assert.equal(power?.crossDomainLinks[0]?.toDomainId, 'semicap-data-center-equipment')
  assert.deepEqual(power?.crossDomainLinks[0]?.fromMechanisms, ['data_center_load'])
  assert.equal(semicap?.crossDomainLinks[0]?.relationship, 'constrains')
})

test('cross-domain correlator requires independent evidence on both hypotheses and never promotes directly', async () => {
  const [source, migration, workspace] = await Promise.all([
    readFile(new URL('../lib/server/world-memory.ts', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/202608040005_market_hypothesis_cross_domain_links.sql', import.meta.url), 'utf8'),
    readFile(new URL('../components/markets/MarketThesisWorkspace.tsx', import.meta.url), 'utf8'),
  ])
  assert.match(source, /Cross-domain links preserve a transmission mechanism/)
  assert.match(source, /sourceObservationIds\.length < 2/)
  assert.match(source, /row\.status === 'complete' && critique\.verdict === 'pass'/)
  assert.match(source, /\? 'active'\s*:\s*'forming'/)
  assert.match(source, /market_hypothesis_cross_domain_links/)
  assert.match(source, /crossDomainLinks:/)
  assert.match(workspace, /Cross-domain mechanism map/)
  assert.match(workspace, /Forming links are research context only/)
  assert.match(migration, /unique \(owner_id, from_hypothesis_id, to_hypothesis_id, link_id\)/i)
})
