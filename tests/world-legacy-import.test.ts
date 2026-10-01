import test from 'node:test'
import assert from 'node:assert/strict'
import {legacyWorldNodes} from '../lib/server/world-legacy-import.ts'
import type {MarketThesisWorkspaceData} from '../lib/markets/types.ts'

test('legacy import preserves original identity and disagreement without inventing confirmed facts or outcomes',()=>{
 const workspace:MarketThesisWorkspaceData={baseline:null,frontiers:[],theses:[],crossDomainLinks:[],hypotheses:[{
  id:'original-id',ownerId:'owner',title:'Power constraint',status:'active',scope:'power',horizon:'12 months',coreMechanism:'Supply limits capacity',
  causalGraph:[],confidence:52,unresolvedNodes:['Grid access'],counterThesis:'Capacity may expand',evidence:[],parentHypothesisId:null,
  createdAt:'2026-08-01T00:00:00Z',updatedAt:'2026-09-01T00:00:00Z',
 }]}
 const [node]=legacyWorldNodes(workspace,new Set(),new Date('2026-10-01T00:00:00Z'))
 assert.equal(node.asOf,'2026-09-01T00:00:00Z')
 assert.deepEqual(node.aliases,['original-id'])
 assert.ok(node.claims.every(c=>c.assessment===true))
 assert.match(node.body,/legacy\/shadow/);assert.match(node.body,/Grid access/)
 assert.equal(node.confidence,52)
 assert.deepEqual(legacyWorldNodes(workspace,new Set([node.id]),new Date()),[])
})
