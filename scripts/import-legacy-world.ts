import { validateWorldUpdateProposal } from '../lib/markets/world-thinker-types.ts'
import { MARKETS_OWNER_ID } from '../lib/auth/markets-auth.ts'
import { fetchMarketThesisWorkspace } from '../lib/server/world-memory.ts'
import { legacyWorldNodes, legacyImportProposal } from '../lib/server/world-legacy-import.ts'
import { currentWorldCommit, worldRepositoryRoot, worldRepositoryBranch, commitWorldUpdate, validateWorldProposalAgainstState } from '../lib/server/world-repository.ts'
import { readWorldCommit, projectWorldRepository } from '../lib/server/world-projection.ts'

const root=worldRepositoryRoot(),branch=worldRepositoryBranch(),workspace=await fetchMarketThesisWorkspace(MARKETS_OWNER_ID)
let commit=await currentWorldCommit(root,branch)
if(!commit)throw new Error('Initialize the existing World repository before importing legacy records')
let snapshot=await readWorldCommit(root,commit)
const nodes=legacyWorldNodes(workspace,new Set(snapshot.nodes.map(n=>n.node.id)),new Date())
console.log(JSON.stringify({apply:process.argv.includes('--apply'),authority:'git-world-v1',nodes:nodes.map(n=>({id:n.id,title:n.title,asOf:n.asOf,status:n.status,bodyBytes:Buffer.byteLength(n.body)})),legacyPredictionsRemainInResolver:true}))
for(let i=0;i<nodes.length;i+=20) {
 const current=snapshot.nodes.find(n=>n.node.kind==='current')?.node
 if(!current)throw new Error('Current World navigation node is unavailable')
 const proposal=validateWorldUpdateProposal(legacyImportProposal(nodes.slice(i,i+20),current,commit,new Date()))
 validateWorldProposalAgainstState(proposal,snapshot.nodes.map(n=>n.node),snapshot.sources.map(s=>s.id))
 if(!process.argv.includes('--apply'))continue
 const result=await commitWorldUpdate(proposal,{root,branch,push:false})
 commit=result.commit; await projectWorldRepository({commit,root,branch,canonical:false})
 snapshot=await readWorldCommit(root,commit)
 console.log(JSON.stringify({commit,imported:proposal.upserts.length-1}))
}
