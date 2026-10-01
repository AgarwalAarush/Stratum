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

test('legacy cross-domain writer cannot create a competing belief authority', async()=>{const {correlateCrossDomainHypotheses}=await import('../lib/server/world-memory.ts');await assert.rejects(correlateCrossDomainHypotheses('owner'),/legacy belief writer retired/)})
